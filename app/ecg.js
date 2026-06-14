const app = getApp();
const API_BASE = 'https://ranking.runorb.org/api';

// HeartLink ECG 蓝牙服务UUID
const ECG_SERVICE_UUID = '0000FFE0-0000-1000-8000-00805F9B34FB';
const ECG_DATA_CHAR = '0000FFE1-0000-1000-8000-00805F9B34FB';
const ECG_CMD_CHAR = '0000FFE2-0000-1000-8000-00805F9B34FB';
const ECG_STATUS_CHAR = '0000FFE3-0000-1000-8000-00805F9B34FB';

const SAMPLE_RATE = 250;       // 250Hz
const RECORD_SECONDS = 10;     // 10秒
const TOTAL_SAMPLES = 2500;    // 总样本数
const BATCH_SIZE = 25;         // 每批25个样本

// 画布尺寸
const CANVAS_W = 320;
const CANVAS_H = 180;

Page({
  data: {
    // BLE状态
    deviceName: '',
    deviceId: '',
    connected: false,
    scanning: false,
    devicesList: [],
    showDevicesList: false,

    // ECG状态
    ecgStatus: 'idle',       // idle | recording | done | error
    statusText: '点击「搜索设备」连接HeartLink',
    progress: 0,
    elapsed: 0,

    // ECG数据
    ecgSamples: [],
    // 画布
    canvasWidth: CANVAS_W,
    canvasHeight: CANVAS_H,
    uploaded: false,
    uploadResult: '',
  },

  // 已收集的样本
  _samples: [],
  _recording: false,
  _batchCount: 0,
  _deviceId: '',
  _context: null,

  // ====== 生命周期 ======
  onLoad() {
    this._context = wx.createCanvasContext('ecgCanvas');
    // 初始化画布网格
    this.drawGrid();
  },

  onUnload() {
    this.disconnectDevice();
  },

  // ====== BLE搜索连接 ======
  startScan() {
    var that = this;
    that.setData({ scanning: true, devicesList: [], showDevicesList: true, statusText: '正在搜索HeartLink设备...' });

    wx.startBluetoothDevicesDiscovery({
      allowDuplicatesKey: false,
      success() {
        // 监听新设备
        wx.onBluetoothDeviceFound(function(res) {
          var devices = res.devices;
          for (var i = 0; i < devices.length; i++) {
            var d = devices[i];
            // 过滤HeartLink设备
            if (d.name && d.name.indexOf('HeartLink') !== -1) {
              var list = that.data.devicesList;
              var exists = false;
              for (var j = 0; j < list.length; j++) {
                if (list[j].deviceId === d.deviceId) { exists = true; break; }
              }
              if (!exists) {
                list.push({
                  deviceId: d.deviceId,
                  name: d.name || 'HeartLink-ECG',
                  RSSI: d.RSSI || 0,
                });
                that.setData({ devicesList: list });
              }
            }
          }
        });
      },
      fail() {
        that.setData({ scanning: false, statusText: '蓝牙搜索失败，请开启蓝牙和定位权限' });
      }
    });

    // 30秒超时
    setTimeout(function() {
      wx.stopBluetoothDevicesDiscovery({});
      that.setData({ scanning: false });
      if (that.data.devicesList.length === 0) {
        that.setData({ statusText: '未找到设备，请确认HeartLink已开机' });
      }
    }, 30000);
  },

  stopScan() {
    wx.stopBluetoothDevicesDiscovery({});
    this.setData({ scanning: false });
  },

  connectDevice(e) {
    var that = this;
    var deviceId = e.currentTarget.dataset.deviceId;
    var deviceName = e.currentTarget.dataset.deviceName;

    that.stopScan();
    that.setData({
      statusText: '正在连接 ' + deviceName + '...',
      showDevicesList: false,
    });

    wx.createBLEConnection({
      deviceId: deviceId,
      success() {
        that._deviceId = deviceId;
        that.setData({
          connected: true,
          deviceId: deviceId,
          deviceName: deviceName,
          statusText: '已连接 ' + deviceName + '，正在获取服务...',
        });
        that.discoverServices(deviceId);
      },
      fail(err) {
        that.setData({
          statusText: '连接失败: ' + (err.errMsg || '未知错误'),
          connected: false,
        });
      }
    });
  },

  discoverServices(deviceId) {
    var that = this;
    wx.getBLEDeviceServices({
      deviceId: deviceId,
      success(res) {
        var services = res.services;
        var found = false;
        for (var i = 0; i < services.length; i++) {
          if (services[i].uuid.toUpperCase() === ECG_SERVICE_UUID) {
            found = true;
            that.getCharacteristics(deviceId);
            break;
          }
        }
        if (!found) {
          that.setData({ statusText: '未找到ECG服务，设备不兼容', connected: false });
          that.disconnectDevice();
        }
      },
      fail() {
        that.setData({ statusText: '获取服务失败', connected: false });
        that.disconnectDevice();
      }
    });
  },

  getCharacteristics(deviceId) {
    var that = this;
    wx.getBLEDeviceCharacteristics({
      deviceId: deviceId,
      serviceId: ECG_SERVICE_UUID,
      success(res) {
        var chars = res.characteristics;
        for (var i = 0; i < chars.length; i++) {
          var c = chars[i];
          // 订阅数据特征值
          if (c.uuid.toUpperCase() === ECG_DATA_CHAR) {
            wx.notifyBLECharacteristicValueChange({
              deviceId: deviceId,
              serviceId: ECG_SERVICE_UUID,
              characteristicId: c.uuid,
              state: true,
              success() {
                that.setData({ statusText: '已连接，准备就绪。点击「开始采集」' });
              },
              fail() {
                that.setData({ statusText: '订阅数据失败' });
              }
            });
          }
        }

        // 监听数据
        wx.onBLECharacteristicValueChange(function(res) {
          if (res.characteristicId.toUpperCase() === ECG_DATA_CHAR) {
            that.onECGData(res.value);
          }
        });
      },
      fail() {
        that.setData({ statusText: '获取特征值失败' });
      }
    });
  },

  disconnectDevice() {
    if (this._deviceId) {
      wx.closeBLEConnection({ deviceId: this._deviceId });
    }
    this._deviceId = '';
    this._samples = [];
    this.setData({ connected: false, ecgStatus: 'idle' });
  },

  // ====== ECG数据处理 ======
  onECGData(buffer) {
    if (!this._recording) return;

    // 解析批次数据 (25个样本, 每个2字节大端序)
    var samples = [];
    for (var i = 0; i < 25; i++) {
      var high = buffer[i * 2];
      var low = buffer[i * 2 + 1];
      var value = (high << 8) | low;
      samples.push(value);
      this._samples.push(value);
    }

    this._batchCount++;
    var elapsed = Math.floor(this._batchCount / (SAMPLE_RATE / BATCH_SIZE));
    if (elapsed > RECORD_SECONDS) elapsed = RECORD_SECONDS;

    var progress = Math.floor(this._samples.length / TOTAL_SAMPLES * 100);
    if (progress > 100) progress = 100;

    this.setData({
      progress: progress,
      elapsed: elapsed,
      statusText: '采集中... ' + elapsed + 's / ' + RECORD_SECONDS + 's',
    });

    // 实时绘制波形（只画最近2秒 = 500个样本）
    if (this._batchCount % 2 === 0) {
      this.drawWaveform();
    }

    // 10秒采集完毕
    if (this._samples.length >= TOTAL_SAMPLES) {
      this.onRecordingComplete();
    }
  },

  // ====== 开始采集 ======
  startRecording() {
    if (!this.data.connected) {
      wx.showToast({ title: '请先连接设备', icon: 'none' });
      return;
    }

    this._samples = [];
    this._batchCount = 0;
    this._recording = true;

    this.setData({
      ecgStatus: 'recording',
      progress: 0,
      elapsed: 0,
      uploaded: false,
      uploadResult: '',
      statusText: '采集中... 0s / 10s',
    });

    // 发送开始命令
    var that = this;
    wx.writeBLECharacteristicValue({
      deviceId: that._deviceId,
      serviceId: ECG_SERVICE_UUID,
      characteristicId: ECG_CMD_CHAR,
      value: new Uint8Array([0x01]).buffer,
      fail() {
        // 如果写入失败，设备可能已有按钮可以启动
        console.log('发送开始命令失败，通过硬件按钮启动');
      }
    });
  },

  // ====== 采集完成 ======
  onRecordingComplete() {
    this._recording = false;
    this._batchCount = 0;

    // 绘制完整波形
    this.drawFullWaveform();

    this.setData({
      ecgStatus: 'done',
      ecgSamples: this._samples.slice(),
      statusText: '采集完成！共 ' + this._samples.length + ' 个样本',
      progress: 100,
    });

    this.sendStopCommand();
    this.uploadECG();
  },

  sendStopCommand() {
    var that = this;
    wx.writeBLECharacteristicValue({
      deviceId: that._deviceId,
      serviceId: ECG_SERVICE_UUID,
      characteristicId: ECG_CMD_CHAR,
      value: new Uint8Array([0x02]).buffer,
      fail() {}
    });
  },

  // ====== 上传ECG到云端 ======
  uploadECG() {
    var that = this;
    if (that._samples.length < 100) {
      that.setData({ uploadResult: '数据太少，跳过上传' });
      return;
    }

    that.setData({ uploadResult: '上传中...' });

    // 提取前200个样本（约0.8秒）作为预览数据
    var preview = that._samples.slice(0, 200);
    // 全部样本转为字符串
    var allSamples = that._samples.join(',');

    wx.request({
      url: API_BASE + '/ecg/upload',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: {
        userId: app.globalData.userId || 'wx_' + wx.getAccountInfoSync().miniProgram.appId,
        samples: allSamples,
        samplingRate: SAMPLE_RATE,
        duration: RECORD_SECONDS,
        preview: preview,
        deviceName: that.data.deviceName || 'HeartLink-ECG',
      },
      success(res) {
        if (res.data && res.data.success) {
          that.setData({ uploaded: true, uploadResult: '✅ 已上传到云端' });
        } else {
          that.setData({ uploadResult: '上传失败: ' + (res.data?.error || '未知') });
        }
      },
      fail() {
        that.setData({ uploadResult: '网络错误，请稍后重试' });
      }
    });
  },

  // ====== 画布绘制 ======
  drawGrid() {
    var ctx = this._context;
    ctx.setStrokeStyle('#333');
    ctx.setLineWidth(0.5);

    // 网格竖线
    for (var x = 0; x <= CANVAS_W; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_H);
      ctx.stroke();
    }
    // 网格横线
    for (var y = 0; y <= CANVAS_H; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_W, y);
      ctx.stroke();
    }
    ctx.draw();
  },

  drawWaveform() {
    var ctx = this._context;
    var samples = this._samples;
    var len = samples.length;
    if (len < 2) return;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    
    // 只画最近500个样本（2秒）
    var start = Math.max(0, len - 500);
    var displaySamples = samples.slice(start, len);
    var count = displaySamples.length;

    ctx.setStrokeStyle('#00FF88');
    ctx.setLineWidth(1.5);
    ctx.beginPath();

    for (var i = 0; i < count; i++) {
      var x = Math.floor(i / count * CANVAS_W);
      // 将ADC值映射到画布上 (0~4095 → CANVAS_H~0)
      var y = CANVAS_H - (displaySamples[i] / 4096 * CANVAS_H);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.draw();
  },

  drawFullWaveform() {
    var ctx = this._context;
    var samples = this._samples;
    var count = samples.length;
    if (count < 2) return;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.setStrokeStyle('#00FF88');
    ctx.setLineWidth(1);
    ctx.beginPath();

    // 10秒2500个样本压缩到320像素宽，每8个样本取一个点
    var step = Math.max(1, Math.floor(count / CANVAS_W));

    for (var i = 0; i < count; i += step) {
      var x = Math.floor(i / count * CANVAS_W);
      var y = CANVAS_H - (samples[i] / 4096 * CANVAS_H);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.draw();
  },

  // ====== 重测 ======
  reset() {
    this._samples = [];
    this._batchCount = 0;
    this._recording = false;
    this.setData({
      ecgStatus: 'idle',
      progress: 0,
      elapsed: 0,
      uploaded: false,
      uploadResult: '',
      statusText: this.data.connected ? '准备就绪。点击「开始采集」' : '点击「搜索设备」连接HeartLink',
    });
    this.drawGrid();
  },

  // ====== 返回 ======
  GoBack() {
    this.disconnectDevice();
    wx.navigateBack();
  },
});
