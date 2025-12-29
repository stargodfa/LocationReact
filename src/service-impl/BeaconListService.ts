// src/service-impl/BeaconListService.ts

import IBeaconListService, {
  IBeaconListState,
  BeaconMac,
  BeaconListListener,
} from "../service-api/IBeaconListService";

/** 你服务器提供的 HTTP 接口路径。按你后端实际改这里即可。 */
const DEFAULT_ENDPOINTS = ["/api/maclist", "/maclist", "/api/beacons/maclist"];

function normalizeMac(input: string): string {
  const hex = input.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (hex.length !== 12) return input.toUpperCase();
  return hex.match(/.{2}/g)!.join(":");
}

function dedupSort(list: string[]): string[] {
  const set = new Set<string>();
  for (const m of list) {
    if (!m) continue;
    set.add(normalizeMac(m));
  }
  return Array.from(set).sort();
}

function isStringArray(x: any): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === "string");
}

export default class BeaconListService implements IBeaconListService {
  private state: IBeaconListState = {
    macList: [],
    loading: false,
  };

  private listeners = new Set<BeaconListListener>();
  private endpoints: string[] = DEFAULT_ENDPOINTS;

  getState(): IBeaconListState {
    return this.state;
  }

  subscribe(listener: BeaconListListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private emit(next: Partial<IBeaconListState>) {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l(this.state);
  }

  async refresh(): Promise<void> {
    this.emit({ loading: true, error: undefined });

    let lastErr: any = null;

    for (const url of this.endpoints) {
      try {
        const resp = await fetch(url, { method: "GET" });
        if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);

        const data = await resp.json();

        let list: string[] | null = null;
        if (isStringArray(data)) list = data;
        else if (isStringArray(data?.mac_list)) list = data.mac_list;
        else if (isStringArray(data?.maclist)) list = data.maclist;
        else if (isStringArray(data?.macs)) list = data.macs;

        if (!list) throw new Error("maclist response format invalid");

        this.emit({
          macList: dedupSort(list),
          loading: false,
          error: undefined,
          lastUpdatedAt: Date.now(),
        });
        return;
      } catch (e) {
        lastErr = e;
      }
    }

    this.emit({
      loading: false,
      error: lastErr ? String(lastErr) : "refresh failed",
    });
  }

  /** WebSocket 广播入口。返回 true 表示已处理该消息 */
  ingestFrame(msg: any): boolean {
    if (!msg || typeof msg !== "object") return false;

    const cmd = String(msg.cmd ?? "");

    // 整表推送
    if (
      cmd === "MacList" ||
      cmd === "BeaconMacList" ||
      cmd === "BeaconList" ||
      cmd === "BeaconMacs"
    ) {
      const macListField = msg.beaconlist ?? msg.maclist ?? msg.macs ?? msg.list ?? null;
      if (isStringArray(macListField)) {
        this.emit({
          macList: dedupSort(macListField),
          lastUpdatedAt: Date.now(),
          error: undefined,
        });
      }
      return true;
    }

    // 增量新增
    if (cmd === "BeaconAdded" || cmd === "MacAdded") {
      const mac = msg.mac ?? msg.target_mac ?? msg.addr;
      if (typeof mac === "string") this.addMac(mac);
      return true;
    }

    // 增量删除
    if (cmd === "BeaconRemoved" || cmd === "MacRemoved") {
      const mac = msg.mac ?? msg.target_mac ?? msg.addr;
      if (typeof mac === "string") this.removeMac(mac);
      return true;
    }

    return false;
  }

  setMacList(list: BeaconMac[]): void {
    this.emit({
      macList: dedupSort(list),
      lastUpdatedAt: Date.now(),
      error: undefined,
    });
  }

  addMac(mac: BeaconMac): void {
    const n = normalizeMac(mac);
    const next = new Set(this.state.macList);
    next.add(n);
    this.emit({
      macList: Array.from(next).sort(),
      lastUpdatedAt: Date.now(),
      error: undefined,
    });
  }

  removeMac(mac: BeaconMac): void {
    const n = normalizeMac(mac);
    const next = this.state.macList.filter((m) => m !== n);
    this.emit({
      macList: next,
      lastUpdatedAt: Date.now(),
      error: undefined,
    });
  }
}
