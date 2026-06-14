# BLE Protocol

## Service & Characteristics

| UUID | Name | Type | Description |
|------|------|------|-------------|
| `0000FFE0-0000-1000-8000-00805F9B34FB` | ECG Service | Primary | |
| `0000FFE1-0000-1000-8000-00805F9B34FB` | ECG Data | Notify | 25 samples per notification |
| `0000FFE2-0000-1000-8000-00805F9B34FB` | ECG Command | Write | Start/stop recording |
| `0000FFE3-0000-1000-8000-00805F9B34FB` | ECG Status | Read/Notify | Device status |

## ECG Data Format

Each notification contains 25 samples, 2 bytes per sample (big-endian):

```
Byte 0-1:   Sample 0 (uint16, 0-4095)
Byte 2-3:   Sample 1
...
Byte 48-49: Sample 24
```

## Commands

| Byte | Action |
|------|--------|
| `0x01` | Start recording |
| `0x02` | Stop recording |
| `0x03` | Query status |

## Status Values

| Value | State |
|-------|-------|
| `0` | Idle |
| `1` | Recording |
| `2` | Error (leads off) |

## Sampling

- Rate: 250 Hz
- Duration: 10 seconds (2500 samples total)
- ADC: 12-bit, 0-4095 range
- Center value (no signal): ~2048
