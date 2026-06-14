/**
 * HeartLink ECG — nRF52840 固件
 *
 * 从AD8232读取模拟ECG信号，通过BLE广播到手机
 *
 * 硬件:
 *   - MCU: nRF52840 (Arduino框架)
 *   - ECG前端: AD8232 单导联心电模块
 *   - 采样率: 250Hz (每个样本4ms)
 *   - BLE: 自定义ECG服务
 *
 * 接线:
 *   AD8232 OUTPUT → A0 (P0.02)
 *   AD8232 LO+    → D5 (P0.15)
 *   AD8232 LO-    → D6 (P0.16)
 *   按钮          → D7 (P0.17) → GND
 *   LED           → D13 (P1.15) 内置LED
 */

#include <BLEPeripheral.h>

// ===== 引脚定义 =====
#define PIN_ECG_INPUT   A0      // AD8232 模拟输出
#define PIN_LO_PLUS     5       // AD8232 导联脱落检测+
#define PIN_LO_MINUS    6       // AD8232 导联脱落检测-
#define PIN_BUTTON      7       // 启动/停止按钮
#define PIN_LED         13      // 内置LED

// ===== 心电参数 =====
#define SAMPLE_RATE     250     // 采样率 250Hz
#define SAMPLE_INTERVAL 4000    // 采样间隔 4000μs = 4ms (1/250Hz)
#define RECORD_SECONDS  10      // 每次记录10秒
#define TOTAL_SAMPLES   (SAMPLE_RATE * RECORD_SECONDS)  // 2500个样本
#define BATCH_SIZE      25      // 每批25个样本 = 50字节
#define BATCHES_PER_SEC (SAMPLE_RATE / BATCH_SIZE)      // 10批/秒

// ===== BLE 服务/特征值 UUID =====
// 自定义ECG服务 (使用标准UUID格式)
#define ECG_SERVICE_UUID        "0000FFE0-0000-1000-8000-00805F9B34FB"
#define ECG_DATA_CHAR_UUID      "0000FFE1-0000-1000-8000-00805F9B34FB"
#define ECG_COMMAND_CHAR_UUID   "0000FFE2-0000-1000-8000-00805F9B34FB"
#define ECG_STATUS_CHAR_UUID    "0000FFE3-0000-1000-8000-00805F9B34FB"

// ===== 常量 =====
#define ADC_RESOLUTION  4096    // 12-bit
#define ADC_REF_VOLTAGE 3.3     // 参考电压
#define ECG_CENTER      2048    // ADC中点值 (VCC/2)

// ===== BLE对象 =====
BLEPeripheral blePeripheral;
BLEService ecgService(ECG_SERVICE_UUID);
BLECharacteristic ecgDataChar(ECG_DATA_CHAR_UUID, BLENotify, BATCH_SIZE * 2);
BLECharacteristic ecgCommandChar(ECG_COMMAND_CHAR_UUID, BLEWriteWithoutResponse | BLEWrite, 1);
BLECharacteristic ecgStatusChar(ECG_STATUS_CHAR_UUID, BLERead | BLENotify, 1);

// ===== 全局状态 =====
enum State {
  STATE_IDLE   = 0,
  STATE_ACTIVE = 1,
  STATE_ERROR  = 2
};

volatile State currentState = STATE_IDLE;
volatile bool recording = false;
volatile bool buttonPressed = false;

// 采样缓冲区
uint16_t sampleBuffer[TOTAL_SAMPLES];
volatile uint16_t sampleIndex = 0;

// 定时器相关
uint32_t lastSampleTime = 0;
uint32_t lastBatchTime = 0;

// 导联状态
bool leadsOff = false;

// ===== 函数声明 =====
void initBLE();
void initADC();
void initPins();
void startRecording();
void stopRecording();
void processSample();
void sendBatch();
void checkLeads();
void setLED(uint8_t r, uint8_t g, uint8_t b);
void handleCommand(uint8_t cmd);
void blinkLED(int times, int delayMs);

// ===== 设置 =====
void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000);

  initPins();
  initADC();
  initBLE();

  Serial.println("HeartLink ECG v1.0 已启动");
  Serial.println("待机中... 按按钮开始采集");
}

// ===== 主循环 =====
void loop() {
  // BLE轮询
  blePeripheral.poll();

  // 检查按钮（去抖动）
  if (digitalRead(PIN_BUTTON) == LOW) {
    delay(50);
    if (digitalRead(PIN_BUTTON) == LOW) {
      if (!recording) {
        startRecording();
      } else {
        stopRecording();
      }
      while (digitalRead(PIN_BUTTON) == LOW) { delay(10); }
    }
  }

  // 如果正在记录，进行采样
  if (recording) {
    processSample();
  }

  // 检查导联脱落
  checkLeads();
}

// ===== 引脚初始化 =====
void initPins() {
  pinMode(PIN_ECG_INPUT, INPUT);
  pinMode(PIN_LO_PLUS, INPUT);
  pinMode(PIN_LO_MINUS, INPUT);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  pinMode(PIN_LED, OUTPUT);

  // 启动LED闪烁表示就绪
  blinkLED(3, 100);
  digitalWrite(PIN_LED, HIGH);  // 常亮表示待机
}

// ===== ADC初始化 =====
void initADC() {
  analogReadResolution(12);  // 12位精度
}

// ===== BLE初始化 =====
void initBLE() {
  blePeripheral.setLocalName("HeartLink-ECG");
  blePeripheral.setDeviceName("HeartLink-ECG");
  blePeripheral.setAppearance(0x0540);  // Heart Rate Sensor appearance

  // 添加特征值
  ecgDataChar.setProperties(BLENotify);
  ecgDataChar.setFixedLen(BATCH_SIZE * 2);

  ecgCommandChar.setProperties(BLEWriteWithoutResponse);
  ecgCommandChar.setFixedLen(1);

  ecgStatusChar.setProperties(BLERead | BLENotify);
  ecgStatusChar.setFixedLen(1);

  // 注册服务和特征值
  ecgService.addCharacteristic(ecgDataChar);
  ecgService.addCharacteristic(ecgCommandChar);
  ecgService.addCharacteristic(ecgStatusChar);
  blePeripheral.addAttribute(ecgService);

  // 命令写入回调
  ecgCommandChar.setEventHandler(BLEWritten, [](BLECentral& central, BLECharacteristic& characteristic) {
    uint8_t cmd = characteristic.value();
    handleCommand(cmd);
  });

  // 连接/断开回调
  blePeripheral.setEventHandler(BLEConnected, [](BLECentral& central) {
    Serial.println("手机已连接");
    digitalWrite(PIN_LED, LOW);
  });

  blePeripheral.setEventHandler(BLEDisconnected, [](BLECentral& central) {
    Serial.println("手机已断开");
    digitalWrite(PIN_LED, HIGH);
    if (recording) stopRecording();
  });

  // 开始广播
  blePeripheral.begin();
  Serial.println("BLE广播中: HeartLink-ECG");
}

// ===== 启动记录 =====
void startRecording() {
  if (leadsOff) {
    Serial.println("导联脱落，无法开始");
    return;
  }

  recording = true;
  sampleIndex = 0;
  lastSampleTime = micros();
  currentState = STATE_ACTIVE;

  // 清空缓冲区
  memset((void*)sampleBuffer, 0, sizeof(sampleBuffer));

  // 更新状态特征值
  uint8_t status = STATE_ACTIVE;
  ecgStatusChar.setValue(&status, 1);

  digitalWrite(PIN_LED, LOW);  // 采集时LED亮
  Serial.println("ECG采集开始... 10秒");
}

// ===== 停止记录 =====
void stopRecording() {
  recording = false;
  currentState = STATE_IDLE;

  // 发送剩余样本
  if (sampleIndex > 0) {
    sendBatch();
  }

  // 更新状态
  uint8_t status = STATE_IDLE;
  ecgStatusChar.setValue(&status, 1);

  digitalWrite(PIN_LED, HIGH);
  Serial.print("采集完成. 共 ");
  Serial.print(sampleIndex);
  Serial.println(" 个样本");

  // 闪烁表示完成
  blinkLED(5, 80);
}

// ===== 采样处理 =====
void processSample() {
  uint32_t now = micros();
  if (now - lastSampleTime < SAMPLE_INTERVAL) {
    return;
  }
  lastSampleTime = now;

  if (sampleIndex >= TOTAL_SAMPLES) {
    stopRecording();
    return;
  }

  // 读取ADC值 (0-4095)
  // AD8232输出以VCC/2为中心，典型范围0.3V~2.7V
  uint16_t raw = analogRead(PIN_ECG_INPUT);
  sampleBuffer[sampleIndex++] = raw;

  // 每 BATCH_SIZE 个样本通过BLE发送一次
  if (sampleIndex % BATCH_SIZE == 0) {
    sendBatch();
    // 也打印到串口做调试
    uint16_t idx = sampleIndex - 1;
    Serial.print("ECG[");
    Serial.print(idx);
    Serial.print("]=");
    Serial.println(raw);
  }
}

// ===== 通过BLE发送一批样本 =====
void sendBatch() {
  uint8_t buffer[BATCH_SIZE * 2];
  uint16_t startIdx = (sampleIndex / BATCH_SIZE - 1) * BATCH_SIZE;

  for (int i = 0; i < BATCH_SIZE; i++) {
    uint16_t idx = startIdx + i;
    if (idx < TOTAL_SAMPLES) {
      // 大端序传输
      buffer[i * 2] = (sampleBuffer[idx] >> 8) & 0xFF;
      buffer[i * 2 + 1] = sampleBuffer[idx] & 0xFF;
    } else {
      buffer[i * 2] = 0;
      buffer[i * 2 + 1] = 0;
    }
  }

  ecgDataChar.setValue(buffer, BATCH_SIZE * 2);
}

// ===== 导联脱落检测 =====
void checkLeads() {
  bool loPlus = digitalRead(PIN_LO_PLUS);
  bool loMinus = digitalRead(PIN_LO_MINUS);
  bool newLeadsOff = (loPlus == HIGH || loMinus == HIGH);

  if (newLeadsOff != leadsOff) {
    leadsOff = newLeadsOff;
    if (leadsOff) {
      Serial.println("警告: 导联脱落!");
      if (recording) stopRecording();
      currentState = STATE_ERROR;
      uint8_t status = STATE_ERROR;
      ecgStatusChar.setValue(&status, 1);
      blinkLED(10, 50);
    } else {
      Serial.println("导联已连接");
      if (currentState == STATE_ERROR) {
        currentState = STATE_IDLE;
        uint8_t status = STATE_IDLE;
        ecgStatusChar.setValue(&status, 1);
        digitalWrite(PIN_LED, HIGH);
      }
    }
  }
}

// ===== 处理手机端命令 =====
void handleCommand(uint8_t cmd) {
  switch (cmd) {
    case 0x01:  // 开始采集
      startRecording();
      break;
    case 0x02:  // 停止采集
      stopRecording();
      break;
    case 0x03:  // 查询状态
      uint8_t status = (uint8_t)currentState;
      ecgStatusChar.setValue(&status, 1);
      break;
  }
}

// ===== LED闪烁 =====
void blinkLED(int times, int delayMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(PIN_LED, LOW);
    delay(delayMs);
    digitalWrite(PIN_LED, HIGH);
    delay(delayMs);
  }
}
