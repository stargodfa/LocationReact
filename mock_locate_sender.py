#!/usr/bin/env python3
"""
mock_locate_sender.py

固定发送 relay_mac = C3:00:00:30:94:F9 的 RelayLocated 消息，
设备沿着定义的路径（waypoints）匀速移动并周期发送位置。

Usage:
    python3 mock_locate_sender.py
"""

import json
import random
import asyncio
import websockets
import time
import math

WS_URL = "ws://127.0.0.1:8080/"
SEND_INTERVAL = 1.0   # 秒，发送频率（每秒发送一次）
RELAY_MAC = "C3:00:00:30:94:F9"

# 固定网关（示例 gmacs），发送时 anchors 会基于当前位置生成与位置相关的 distance/rssi
GATEWAY_PREFIXES = [
    "A0:11:22:33:44",
    "B1:22:33:44:55",
    "C2:33:44:55:66",
    "D3:44:55:66:77"
]

# ------- 路径配置 -------
# 定义一组 waypoint (x, y)。设备会在这些点之间按顺序移动，默认循环往复。
# 6s移动
# 4s走完过道
# 掉头6s
# 2s到门口
WAYPOINTS = [
    (0.0, 10.0),
    (0.0, 10.2),
    (3.0, 10.5),
    (6.0, 10.8),
    (10.0, 9.8),
    (10.0, 10.0),
    (10.0, 10.1),
    (10.0, 9.9),
    (10.0, 10.5),
    (10.0, 10.3),
    (6.0, 10.1),
    (5.0, 10.5),
    (4.8, 9.8),
    (4.6, 9.7),
    (4.0, 9.5),
    (3.5, 8.0),
    (3.0, 6.0),
    (3.1, 6.1),
    (3.0, 5.9)
]

# 每段移动分成多少步（每发送一次前进一步）
STEPS_PER_SEGMENT = 2

# 是否循环路径（True: 到终点后回首再走，False: 到终点后停止）
LOOP = True

# 随机噪声程度（用于 rssi, slight position jitter）
NOISE_POS = 0.05   # 位置抖动（米）
NOISE_RSSI = 2     # RSSI 随机波动（dB）

# --------------------------------

def build_anchors_from_pos(x, y, num_anchors=4):
    """
    基于当前 (x,y) 生成 anchors 列表（包含 gmac, distance, rssi）。
    distance 与 (x,y) 有关联，rssi 根据 distance 计算并加入噪声。
    """
    anchors = []
    # 固定选择前 num_anchors 个 gateway（如果不够则随机生成尾部）
    for i in range(num_anchors):
        base = GATEWAY_PREFIXES[i % len(GATEWAY_PREFIXES)]
        # 增加随机尾巴保证 MAC 唯一感
        gmac = f"{base}:{(i*11)%256:02X}:{(i*37)%256:02X}"
        # 给每个网关设置一个固定坐标（用于模拟距离）
        # 这里把网关按索引放在场地四角附近（可调整）
        gw_positions = [
            (0.0, 0.0),
            (20.0, 0.0),
            (20.0, 10.0),
            (0.0, 10.0)
        ]
        gwx, gwy = gw_positions[i % len(gw_positions)]
        dx = x - gwx
        dy = y - gwy
        distance = math.hypot(dx, dy) + random.uniform(-0.2, 0.2)
        if distance < 0.1:
            distance = 0.1
        # 简单经验模型将 distance -> rssi（不是精确传播模型，仅用于 mock）
        # rssi = A - 20*log10(distance) (加上随机噪声)
        rssi = int(round(-30 - 20 * math.log10(distance + 0.01) + random.uniform(-NOISE_RSSI, NOISE_RSSI)))
        anchors.append({
            "gmac": gmac,
            "distance": round(distance, 2),
            "rssi": rssi
        })
    return anchors

def build_relay_located_at(x, y):
    """
    构建 RelayLocated JSON（字符串）。
    """
    payload = {
        "cmd": "RelayLocated",
        "relay_mac": RELAY_MAC,
        "dev_type": "MBT02",
        "x": round(x + random.uniform(-NOISE_POS, NOISE_POS), 3),
        "y": round(y + random.uniform(-NOISE_POS, NOISE_POS), 3),
        "rssi": random.randint(-100, -40),
        "anchors": build_anchors_from_pos(x, y, num_anchors=4),
        "timestamp": int(time.time() * 1000)
    }
    return json.dumps(payload, ensure_ascii=False)

def interpolate_path(waypoints, steps_per_segment):
    """
    将 waypoints 插值生成完整的轨迹点列表（包含起点）。
    插值方式：每两个相邻点均匀插 steps_per_segment 步（不重复终点）。
    返回一个点列表 [(x,y), ...]
    """
    pts = []
    n = len(waypoints)
    if n == 0:
        return pts
    for idx in range(n - 1):
        x0, y0 = waypoints[idx]
        x1, y1 = waypoints[idx + 1]
        for s in range(steps_per_segment):
            t = s / steps_per_segment
            xi = x0 + (x1 - x0) * t
            yi = y0 + (y1 - y0) * t
            pts.append((xi, yi))
    # append last waypoint
    pts.append(waypoints[-1])
    return pts

async def sender_loop(uri=WS_URL, interval=SEND_INTERVAL):
    path = interpolate_path(WAYPOINTS, STEPS_PER_SEGMENT)
    if not path:
        print("No waypoints defined. Exiting.")
        return

    # 如果 LOOP=True，实现往返循环（ping-pong）
    sequence = path[:]
    if LOOP:
        # create ping-pong by appending reversed path excluding endpoints
        rev = path[::-1]
        # remove first and last to avoid duplicates
        if len(path) > 1:
            rev = rev[1:-1] if len(path) > 2 else []
        sequence = path + rev

    try:
        async with websockets.connect(uri) as ws:
            print(f"[WS] connected to {uri}. Sending RelayLocated for {RELAY_MAC} ...")
            step = 0
            while True:
                idx = step % len(sequence)
                x, y = sequence[idx]
                msg = build_relay_located_at(x, y)
                await ws.send(msg)
                print(f"[WS] Sent ({step}): {msg}")
                step += 1
                await asyncio.sleep(interval)
    except ConnectionRefusedError:
        print(f"[WS] Connection refused: cannot connect to {uri}. Is the server running?")
    except Exception as e:
        print("[WS] Exception:", e)

def main():
    print("Mock locate sender starting.")
    print(f"Relay MAC: {RELAY_MAC}")
    print(f"Waypoints: {WAYPOINTS}")
    print(f"Steps per segment: {STEPS_PER_SEGMENT}, Loop: {LOOP}, Interval: {SEND_INTERVAL}s")
    asyncio.run(sender_loop())

if __name__ == "__main__":
    main()
