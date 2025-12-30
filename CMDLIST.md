# 前端发送命令，服务端返回（WebSocket）

```json
send：
{
  "cmd": "GetMapList"
}
return:
{
  "cmd": "MapList",
  "maps": [
    {
      "id": "room-1",
      "name": "房间1",
      "file": "room-1.png",
      "url": "/static/maps/room-1.png"
    }
  ]
}
```

```json
send：
{
  "cmd": "GetMapScale"
}
return:
{
  "cmd": "MapScale",
  "meter_to_pixel": 300
}
```

```json
send：
{
  "cmd": "SetMapScale",
  "meter_to_pixel": 280.5
}
return:
{
  "cmd": "MapScale",
  "meter_to_pixel": 280.5
}
```

```json
send：
{
  "cmd": "GetBeaconList"
}
return:
{
  "cmd": "MacList",
  "mac_list": [
    "AA:BB:CC:DD:EE:FF",
    "11:22:33:44:55:66"
  ]
}
```

```json
send：
{
  "cmd": "GetBeaconList"
}
return:
{
  "cmd": "BeaconMacList",
  "macs": [
    "AA:BB:CC:DD:EE:FF",
    "11:22:33:44:55:66"
  ]
}
```

```json
send：
{
  "cmd": "RemoveBeacon",
  "mac": "AA:BB:CC:DD:EE:FF"
}
return:
{
  "cmd": "BeaconRemoved",
  "mac": "AA:BB:CC:DD:EE:FF"
}
```

```json
send：
{
  "cmd": "SetBeaconPosition",
  "mac": "AA:BB:CC:DD:EE:FF",
  "x": 1.23,
  "y": 4.56,
  "mode": "manual"
}
return:
{
  "cmd": "BeaconPositions",
  "items": [
    { "mac": "AA:BB:CC:DD:EE:FF", "x": 1.23, "y": 4.56 }
  ]
}
```

```json
send：
{
  "cmd": "ClearCurrentBeaconPosition",
  "mac": "AA:BB:CC:DD:EE:FF",
  "scope": "manual"
}
return:
{
  "cmd": "BeaconPositions",
  "items": [
    { "mac": "11:22:33:44:55:66", "x": 7.89, "y": 0.12 }
  ]
}
```

```json
send：
{
  "cmd": "ClearAllBeaconPositions",
  "scope": "all"
}
return:
{
  "cmd": "BeaconPositions",
  "items": []
}
```

```json
send：
{
  "cmd": "GetBeaconPositions"
}
return:
{
  "cmd": "BeaconPositions",
  "items": [
    { "mac": "AA:BB:CC:DD:EE:FF", "x": 1.23, "y": 4.56 },
    { "mac": "11:22:33:44:55:66", "x": 7.89, "y": 0.12 }
  ]
}
```

```json
send：
{
  "cmd": "SetDefaultBeaconPosition"
}
return:
{
  "cmd": "BeaconPositions",
  "items": [
    { "mac": "AA:BB:CC:DD:EE:FF", "x": 0, "y": 0 },
    { "mac": "11:22:33:44:55:66", "x": 5, "y": 0 }
  ]
}
```

# 服务端主动推送（前端不发送）

```json
send：
{
  "cmd": "(none)"
}
return:
{
  "raw": {
    "mac": "AA:BB:CC:DD:EE:FF",
    "rssi": -63,
    "...": "..."
  },
  "parsed": {
    "...": "..."
  }
}
```

```json
send：
{
  "cmd": "(none)"
}
return:
{
  "cmd": "RelayLocated",
  "target_mac": "AA:BB:CC:DD:EE:FF",
  "x": 1.23,
  "y": 4.56,
  "rssi": -63,
  "dev_type": "MBT02",
  "anchors": [
    { "mac": "11:22:33:44:55:66", "x": 0, "y": 0, "rssi": -70, "dist": 2.3 }
  ]
}
```

# 前端发送请求，服务端返回（HTTP）

```json
send：
{
  "method": "GET",
  "url": "/api/maclist  (或 /maclist 或 /api/beacons/maclist)"
}
return:
[
  "AA:BB:CC:DD:EE:FF",
  "11:22:33:44:55:66"
]
```

```json
send：
{
  "method": "GET",
  "url": "/api/maclist  (或 /maclist 或 /api/beacons/maclist)"
}
return:
{
  "mac_list": [
    "AA:BB:CC:DD:EE:FF",
    "11:22:33:44:55:66"
  ]
}
```

```json
send：
{
  "method": "GET",
  "url": "http://{host}:8082{map.url}"
}
return:
{
  "content_type": "image/*",
  "body": "(地图图片二进制)"
}
```

# 服务端发送命令，前端返回
```
send：
{
    ...
}
return:
{
    ...
}
```