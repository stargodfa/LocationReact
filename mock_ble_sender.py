import json
import random
import websockets
import asyncio

WS_URL = "ws://127.0.0.1:8080/"

# -------------------------------------------------------
# 工具函数
# -------------------------------------------------------

# prefix = "C3:00:00:30"
def random_mac(prefix=""):
    return f"{prefix}:{random.randint(0,255):02X}:{random.randint(0,255):02X}"

def random_raw_hex(n):
    return " ".join(f"{random.randint(0,255):02X}" for _ in range(n))

# -------------------------------------------------------
# 普通信标（不属于 MBT02/MWC01）
# -------------------------------------------------------

def build_beacon_json():
    mac = random_mac("C3:00:00:24")
    return json.dumps({
        "raw": {
            "mac": mac,
            "rssi": random.randint(-85, -30),
            "len": 10,
            "data": random_raw_hex(10),
            "type": "beacon"
        },
        "parsed": None
    })

# -------------------------------------------------------
# MBT02 中继帧（FrameVersion = 0x1A, Usage = 0x01）
# -------------------------------------------------------

def build_relay_json_mbt02():
    mac = random_mac("C3:00:00:30")

    relay_list = []
    count = random.randint(1, 4)

    for i in range(count):
        tail = f"{random.randint(0,255):02X}:{random.randint(0,255):02X}:{random.randint(0,255):02X}"
        relay_list.append({
            "idx": i,
            "tail": tail,
            "rssi": random.randint(-90, -40)
        })

    return json.dumps({
        "raw": {
            "mac": mac,
            "rssi": random.randint(-80, -40),
            "len": 27,                    # MBT02 relay frame length
            "data": random_raw_hex(27)
        },
        "parsed": {
            "type": "relay",
            "vendor": 1,
            "usage": 1,                  # MBT02 => 必须固定为 0x01
            "serial": random.randint(0, 255),
            "count": count,
            "relays": relay_list
        }
    })

# -------------------------------------------------------
# MBT02 组合帧（FrameVersion = 0x03, BlockID = 0x22）
# -------------------------------------------------------

def build_combo_json_mbt02():
    mac = random_mac("C3:00:00:30")

    inner_mac = ":".join(f"{random.randint(0,255):02X}" for _ in range(6))

    return json.dumps({
        "raw": {
            "mac": mac,
            "rssi": random.randint(-75, -35),
            "len": 23,                 # MBT02 combo frame length
            "data": random_raw_hex(23)
        },
        "parsed": {
            "type": "combo",
            "vendor": 1,
            "mac": inner_mac,         # 内嵌 MAC
            "battery": random.randint(20, 100),
            "product": 0x0008,
            "tamper": random.randint(0, 1)  # BlockID 0x22
        }
    })

# -------------------------------------------------------
# 主发送逻辑
# -------------------------------------------------------

async def main():
    async with websockets.connect(WS_URL) as ws:
        print("模拟开发板已连接。开始发送 MBT02 + Beacon 数据...\n")

        while True:
            t = random.randint(0, 2)

            if t == 0:
                payload = build_beacon_json()
            elif t == 1:
                payload = build_relay_json_mbt02()
            else:
                payload = build_combo_json_mbt02()

            await ws.send(payload)
            print("Sent:\n", payload, "\n")

            await asyncio.sleep(1)


if __name__ == "__main__":
    asyncio.run(main())
