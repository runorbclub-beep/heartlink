# HeartLink — Open Source ECG Watch

![HeartLink](docs/images/heartlink_banner.png)

**A minimalist ECG watch. Open source hardware and software.**

Built by a 64-year-old retired engineer as an anniversary gift for his wife. Now available for anyone to build or buy.

---

## Quick Links

| | |
|---|---|
| 🛒 **Buy a pre-built watch** | [Gumroad — $99](https://gumroad.com) |
| 🔧 **Build your own** | See firmware/ and docs/ below |
| 📖 **Read the story** | [Substack — HeartLink Diaries](https://runorb.substack.com) |
| 💬 **Join the builders** | [Telegram group](#) |
| 📧 **Contact** | hello@heartlink.work |

---

## What is HeartLink?

A watch that does **one thing**: measure your heart's electrical signal (ECG).

- Wear it on your left wrist
- Touch the crown with your right finger
- Wait 10 seconds
- Your phone displays a real ECG waveform + heart rate

No screen. No notifications. No step counting. Just your heartbeat.

---

## Repository Structure

```
heartlink/
├── firmware/           # nRF52840 firmware (Arduino)
│   ├── heartlink_ecg.ino   # Main firmware
│   └── circuit/            # KiCad schematic files
├── app/                # WeChat Mini-Program (ECG display)
│   ├── ecg.js
│   ├── ecg.wxml
│   └── ecg.wxss
├── docs/               # Documentation
│   ├── README.md           # This file
│   ├── BUILD.md            # Assembly instructions
│   ├── CONNECT.md          # BLE protocol
│   └── CALIBRATE.md        # Calibration guide
└── LICENSE
```

---

## Specifications

| Parameter | Value |
|-----------|-------|
| MCU | nRF52840 (ARM Cortex-M4, BLE 5.0) |
| ECG Front-End | ADS1292R (medical grade) |
| Sampling Rate | 250 Hz |
| ADC Resolution | 12-bit |
| Recording Duration | 10 seconds |
| Battery | 100mAh LiPo (USB-C charging) |
| Standby Time | ~1 month |
| Connectivity | BLE to smartphone |
| App | WeChat Mini-Program |
| Case | 3D printed (matte black) |
| Wristband | 22mm silicone (replaceable) |

---

## How to Build Your Own

1. **Buy the parts** — See [BUILD.md](docs/BUILD.md) for BOM
2. **Flash the firmware** — Upload `firmware/heartlink_ecg.ino` via Arduino IDE
3. **Print the case** — STL files in `firmware/circuit/`
4. **Assemble** — Follow the [assembly guide](docs/BUILD.md)
5. **Install the app** — Scan QR code for WeChat Mini-Program

**Or just buy one pre-assembled** → [Gumroad](https://gumroad.com)

---

## Disclaimer

This is a DIY hobby project, **not a certified medical device**.

The ECG waveform displayed is for **reference only**. It cannot diagnose medical conditions. It is not FDA, CE, or NMPA certified. If you are concerned about your heart health, consult a doctor.

I'm a retired engineer, not a cardiologist.

---

## License

Hardware: [CERN-OHL-S-2.0](LICENSE) (strongly reciprocal, protects the design)
Firmware & Software: [MIT](LICENSE)

---

*Built with ❤️ and 🤖 by a retired/AI aided engineer.*
