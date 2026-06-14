# HeartLink ECG Hardware Firmware — Arduino nRF52840

## 硬件接线

```
AD8232 模块           nRF52840
─────────────────────────────────
OUTPUT      ─────→   A0 / P0.02 (模拟输入, ADC)
LO+         ─────→   D5 / P0.15 (数字输入, 导联脱落检测)
LO-         ─────→   D6 / P0.16 (数字输入, 导联脱落检测)
3.3V        ─────→   3.3V
GND         ─────→   GND

按钮 (启动/停止ECG记录)
  ─────→   D7 / P0.17 (上拉输入)

LED指示灯
  ─────→   D13 / P1.15 (内置LED)
         → 蓝色: 待机
         → 绿色: 采集中
         → 红色: 导联脱落
```

**电极贴片粘贴方式:**
- 左手腕贴一片（接RA导联线红色夹子）
- 右手腕贴一片（接LA导联线黄色夹子）
- 右腿驱动贴一片（接RL导联线绿色/黑色夹子，可选）

**10秒检测步骤:**
1. 贴好电极片 → 夹上导联线
2. 打开手机Runball小程序 → ECG检测页
3. 小程序搜索并连接HeartLink设备
4. 按一下nRF52840上的按钮 → 开始采集
5. 放松不动10秒 → 自动停止
6. 波形上传到ranking.runorb.org → 可在趋势页查看

---

## 固件烧录

### 环境准备
1. 安装 Arduino IDE 2.x
2. 安装 nRF52840 支持包:
   - 工具→开发板管理器→搜索 `Adafruit nRF52` 或 `Seeed nRF52`
3. 安装 BLEPeripheral 库 (搜索 `BLEPeripheral`)

### 烧录
1. 用USB线连接nRF52840开发板到电脑
2. Arduino IDE → 选择开发板 (如 `Adafruit Feather nRF52840`)
3. 选择端口
4. 上传

### 所需Arduino库
- `BLEPeripheral` — BLE服务
- `Adafruit_SleepyDog` — 看门狗(可选)
- `LowPower` — 低功耗(可选)
