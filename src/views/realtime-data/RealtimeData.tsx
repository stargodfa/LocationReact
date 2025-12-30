/**
 * src/views/realtime-data/RealtimeData.tsx
 *
 * 组件职责：
 * - “画面一：实时数据列表”页面。
 * - 展示两类数据源：
 *   A) BLE 实时广播列表（来自 IBluetoothDataService）
 *   B) 定位结果列表 RelayLocated（来自 ILocateResultService）
 * - 提供过滤条件（MAC、设备类型、广播类型、数据类型、显示模式）。
 * - 当广播类型选择为 locate 时，切换到“定位结果视图”，表格展示 locateService 的结果。
 *
 * 数据流总览：
 * [WebSocket -> WebSocketService -> (BluetoothDataService / LocateResultService)]
 *  -> service 内部维护 state
 *  -> 本组件 useEffect subscribe(service) 获取 state
 *  -> useMemo / filter 派生数据 filteredData / locateFiltered
 *  -> Antd Table 渲染
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  Card,
  Row,
  Col,
  Space,
  Input,
  Select,
  Typography,
  Button,
  Table,
} from "antd";

/**
 * getServiceSync：从 @spring4js/container-browser IoC 容器同步获取服务实例
 * 数据来源：IoC 容器（由 Environment 注册 service-info 后生成）
 * 用途：在模块加载阶段获取 service 单例
 *
 * 注意（事实说明）：
 * - 这里在“模块顶层”调用 getServiceSync，会要求容器在 import 本文件之前已完成注册。
 * - 你的 main.tsx 里是先 env.init + env.setToGlobal，再 render App。
 * - 如果 RealtimeData 被懒加载或之后才 mount，一般不会出问题；
 *   但如果打包/加载顺序导致本模块在注册前被执行，会出现获取失败风险。
 */
import { getServiceSync } from "@spring4js/container-browser";

/**
 * IBluetoothDataService：BLE 实时数据 service 接口
 * IData：该 service 的 state 类型（包含 realTimeDataList 等字段）
 *
 * 数据来源：
 * - service 自己维护，通常由 WebSocket 推送消息驱动更新
 *
 * 用途：
 * - getState() 获取当前 BLE 实时数据状态
 * - subscribe() 订阅后续变化
 * - clearRealTimeDataList() 清空实时列表
 */
import IBluetoothDataService, {
  IData,
} from "../../service-api/IBluetoothDataService";

/**
 * ILocateResultService：定位结果 service 接口
 * ILocateResultState：定位 service 的 state 类型
 * LocateRecord：单条定位记录的数据结构
 *
 * 数据来源：
 * - WebSocket 推送 cmd=RelayLocated 的消息
 * - service 内部缓存 latest/历史等（取决于实现）
 *
 * 用途：
 * - getState() 获取当前定位结果状态
 * - subscribe() 订阅定位结果变化
 */
import ILocateResultService, {
  ILocateResultState,
  LocateRecord,
} from "../../service-api/ILocateResultService";

/**
 * EService：IoC 容器服务 key 枚举
 * 数据来源：src/service-config/EService.ts
 * 用途：通过 getServiceSync 从容器获取对应 service 单例
 */
import EService from "../../service-config/EService";

/**
 * Typography 解构
 * - Title：页面标题
 * - Text：普通文本
 * Select.Option：下拉选项
 *
 * 数据来源：antd 组件库
 * 用途：UI 组件渲染
 */
const { Title, Text } = Typography;
const { Option } = Select;

/**
 * bluetoothDataService：BLE 实时数据 service 单例
 * - 数据来源：IoC 容器（EService.IBluetoothDataService 对应实现）
 * - 用途：提供 BLE 实时数据 state + 订阅能力 + 清空能力
 * - 流向：本组件 useState 初始化、useEffect 订阅、handleClear 调用
 */
const bluetoothDataService = getServiceSync<IBluetoothDataService>(
  EService.IBluetoothDataService
);

/**
 * locateService：定位结果 service 单例
 * - 数据来源：IoC 容器（EService.ILocateResultService 对应实现）
 * - 用途：提供定位结果 state + 订阅能力
 * - 流向：本组件 useState 初始化、useEffect 订阅
 */
const locateService = getServiceSync<ILocateResultService>(
  EService.ILocateResultService
);

/* ----------------- 安全 JSON ----------------- */
/**
 * safeJsonParse：
 * - 输入：字符串 text（通常来自 tableData 的 row.raw / row.parsed）
 * - 数据来源：服务里缓存的字符串字段
 * - 用途：避免 JSON.parse 抛异常导致渲染崩溃
 * - 输出：
 *   - 成功：返回解析后的对象/数组
 *   - 失败：返回 null
 * - 流向：detectDevType/detectFrameType/渲染 JSON 输出时使用
 */
function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* ============================================================
   设备类型判定（仿旧 JS 的 extractFields）
============================================================ */
/**
 * detectDevType：
 * - 输入：
 *   rawObj：row.raw 解析出的对象（可能含 type、vendor 等）
 *   parsedObj：row.parsed 解析出的对象（可能含 devType/dev_type/vendor 等）
 * - 数据来源：
 *   - rawObj/parsedObj 来自 bluetoothDataService 的列表字段
 * - 用途：
 *   - 用于“设备类型”过滤（BEACON/MBT02/MWC01/unknown）
 * - 输出：
 *   - 字符串类型名
 * - 流向：
 *   - filteredData 过滤时使用
 */
function detectDevType(rawObj: any, parsedObj: any): string {
  // 1) 如果 parsedObj 里明确有 devType/dev_type，优先使用
  if (parsedObj?.devType || parsedObj?.dev_type) {
    return parsedObj.devType || parsedObj.dev_type;
  }

  // 2) 如果 vendor 是数字，按 vendor 映射到设备型号
  // vendor 的语义取决于你设备协议：
  // - vendor=1 => MWC01
  // - vendor=2 => MBT02
  if (typeof parsedObj?.vendor === "number") {
    if (parsedObj.vendor === 1) return "MWC01";
    if (parsedObj.vendor === 2) return "MBT02";
  }

  // 3) 尝试从 type 字段判断是否为 beacon 帧
  const frameType = rawObj?.type || parsedObj?.type || "";
  if (String(frameType).toLowerCase() === "beacon") {
    return "BEACON";
  }

  // 4) 都识别不出来时，标记 unknown
  return "unknown";
}

/* ============================================================
   广播类型判定（只用于 BLE 表格过滤）
============================================================ */
/**
 * detectFrameType：
 * - 输入：rawObj/parsedObj
 * - 数据来源：同上，来自 row.raw/row.parsed 解析
 * - 用途：
 *   - 用于“广播类型(frameType)”过滤（beacon/locate/relay/combo...）
 * - 输出：帧类型字符串
 * - 流向：filteredData 过滤时使用
 */
function detectFrameType(rawObj: any, parsedObj: any): string {
  return rawObj?.type || parsedObj?.type || "";
}

/* ============================================================
   组件
============================================================ */
const RealtimeData: React.FC = () => {
  /* ============================================================
     1) 从 BLE service 读取并订阅 state
  ============================================================ */

  /**
   * blueData：
   * - 类型：IData（由 IBluetoothDataService 导出）
   * - 初始数据来源：bluetoothDataService.getState()
   * - 用途：承载 BLE 实时数据 state（例如 realTimeDataList）
   * - 更新来源：bluetoothDataService.subscribe 的回调
   * - 流向：tableData、bleLatestList、filteredData、Table dataSource
   */
  const [blueData, setBlueData] = useState<IData>(
    bluetoothDataService.getState()
  );

  /**
   * tableData：
   * - 数据来源：blueData.realTimeDataList
   * - 用途：BLE 广播原始列表（可能很长且高频更新）
   * - 流向：bleLatestList(useMemo) -> filteredData(filter) -> Table
   */
  const tableData = blueData.realTimeDataList;

  /* ============================================================
     2) 从定位 service 读取并订阅 state
  ============================================================ */

  /**
   * locState：
   * - 类型：ILocateResultState
   * - 初始数据来源：locateService.getState()
   * - 用途：承载定位结果 state（通常是 results 的 map）
   * - 更新来源：locateService.subscribe 回调
   * - 流向：locateList -> locateFiltered -> Table
   */
  const [locState, setLocState] = useState<ILocateResultState>(
    locateService.getState()
  );

  /**
   * locateList：
   * - 类型：LocateRecord[]
   * - 数据来源：Object.values(locState.results || {})
   * - 用途：
   *   把 results 这个 “mac -> record” 的映射转换为数组，便于 Table 渲染和 filter
   * - 流向：locateFiltered -> Table
   *
   * 备注：
   * - 这里假设 results 的值就是 LocateRecord
   * - 若 results 为空，使用 {} 防止 Object.values 报错
   */
  const locateList: LocateRecord[] = Object.values(locState.results || {});

  /* ============================================================
     3) UI 过滤条件 state（由用户交互驱动）
  ============================================================ */

  /**
   * macFilter：
   * - 数据来源：Input 输入框
   * - 用途：MAC 模糊匹配过滤（BLE 和定位两种表都用）
   * - 流向：filteredData / locateFiltered 的 filter 条件
   */
  const [macFilter, setMacFilter] = useState("");

  /**
   * devTypeFilter：
   * - 初始值：MBT02（默认只看 MBT02）
   * - 数据来源：Select 下拉框
   * - 用途：设备类型过滤（all / BEACON / MBT02 / MWC01）
   * - 流向：frameTypeOptions(useMemo)、filteredData、locateFiltered
   */
  const [devTypeFilter, setDevTypeFilter] = useState("MBT02");

  /**
   * frameTypeFilter：
   * - 初始值：locate（默认显示定位结果）
   * - 数据来源：Select 下拉框
   * - 用途：
   *   - 作为“视图模式开关”：locate 时切换到定位结果表
   *   - 非 locate 时作为 BLE 广播类型过滤条件（all/beacon/relay/combo等）
   * - 流向：isLocateView、filteredData / locateColumns / bleColumns 选择
   */
  const [frameTypeFilter, setFrameTypeFilter] = useState("locate");

  /**
   * dataTypeFilter：
   * - 初始值：parsed（默认只看解析数据列）
   * - 数据来源：Select 下拉框（locate 视图下禁用）
   * - 用途：控制 BLE 表格显示哪些列，并可过滤掉缺失字段的行
   * - 流向：showRaw/showParsed、filteredData 过滤条件、bleColumns 组装
   */
  const [dataTypeFilter, setDataTypeFilter] = useState("parsed");

  /**
   * displayMode：
   * - 初始值：string
   * - 数据来源：Select 下拉框
   * - 用途：控制 raw/parsed/locate 的渲染格式
   *   - string：紧凑输出（基本等价于 JSON.stringify(obj) 无缩进）
   *   - json：格式化输出（JSON.stringify(obj,null,2)）
   * - 流向：renderRawText/renderParsedText/renderLocateInfo
   */
  const [displayMode, setDisplayMode] = useState<"string" | "json">("string");

  /**
   * isLocateView：
   * - 数据来源：frameTypeFilter === "locate"
   * - 用途：决定当前显示“定位结果表”还是“BLE 广播表”
   * - 流向：
   *   - UI：dataTypeFilter 下拉禁用
   *   - 逻辑：showRaw/showParsed/filteredData vs locateFiltered/columns 选择
   */
  const isLocateView = frameTypeFilter === "locate";

  /* ============================================================
     4) 订阅 service：把 service state 更新推入 React state
  ============================================================ */

  /**
   * 订阅 BLE service：
   * - 数据来源：bluetoothDataService 内部 state 变化
   * - 用途：变化时 setBlueData 触发本组件重渲染
   * - 返回值：unsubscribe 函数，useEffect cleanup 时执行
   */
  useEffect(() => {
    return bluetoothDataService.subscribe((data) => setBlueData(data));
  }, []);

  /**
   * 订阅定位 service：
   * - 数据来源：locateService 内部 state 变化
   * - 用途：变化时 setLocState 触发重渲染
   * - 返回值：unsubscribe 函数
   */
  useEffect(() => {
    return locateService.subscribe((s) => setLocState(s));
  }, []);

  /**
   * handleClear：
   * - 数据来源：用户点击“清空列表”按钮
   * - 用途：清空 BLE 实时列表（只影响 BLE 表，不影响 locate 表）
   * - 流向：bluetoothDataService.clearRealTimeDataList() -> service state 更新 -> 订阅回调 -> setBlueData
   */
  const handleClear = () => {
    bluetoothDataService.clearRealTimeDataList();
  };

  /* ============================================================
     5) frameTypeOptions：根据 devTypeFilter 限制广播类型可选项
  ============================================================ */

  /**
   * frameTypeOptions：
   * - 类型：{ value: string; label: string }[]
   * - 数据来源：devTypeFilter（用户选择的设备类型）
   * - 用途：限制广播类型下拉选项，减少不可能组合
   * - 流向：广播类型 Select 渲染 options
   *
   * 规则（代码写死的业务逻辑）：
   * - devType=BEACON：只能选 beacon（这里没有 locate 选项）
   * - devType=MBT02/MWC01：可选 all/locate/relay/combo（不显示 beacon）
   * - devType=all/unknown：可选 all/beacon/locate/relay/combo
   */
  const frameTypeOptions = useMemo(() => {
    if (devTypeFilter === "BEACON") {
      return [{ value: "beacon", label: "beacon" }];
    }

    if (devTypeFilter === "MBT02" || devTypeFilter === "MWC01") {
      return [
        { value: "all", label: "全部" },
        { value: "locate", label: "locate" },
        { value: "relay", label: "relay" },
        { value: "combo", label: "combo" },
      ];
    }

    return [
      { value: "all", label: "全部" },
      { value: "beacon", label: "beacon" },
      { value: "locate", label: "locate" },
      { value: "relay", label: "relay" },
      { value: "combo", label: "combo" },
    ];
  }, [devTypeFilter]);

  /**
   * devType 改变时，如果当前 frameTypeFilter 不在允许集合里，自动修正
   *
   * 数据来源：
   * - devTypeFilter 改变
   * - frameTypeOptions 改变
   * - 当前 frameTypeFilter
   *
   * 用途：
   * - 防止出现“下拉选项不包含当前值”导致 UI 不一致
   *
   * 修正规则：
   * - 如果允许 locate，则默认切到 locate
   * - 否则使用 options 的第一个 value
   *
   * 流向：setFrameTypeFilter -> isLocateView/过滤逻辑/columns 切换
   */
  useEffect(() => {
    const allowed = new Set(frameTypeOptions.map((o) => o.value));
    if (!allowed.has(frameTypeFilter)) {
      setFrameTypeFilter(
        allowed.has("locate") ? "locate" : frameTypeOptions[0].value
      );
    }
  }, [devTypeFilter, frameTypeOptions, frameTypeFilter]);

  /* ============================================================
     6) BLE：按 MAC 只保留最新一条（派生列表）
  ============================================================ */

  /**
   * bleLatestList：
   * - 数据来源：tableData（BLE 原始实时列表）
   * - 用途：
   *   - 你希望表格“像 locate 一样只显示每个 MAC 的最新状态”
   *   - 通过 Map 去重，保留每个 mac 的第一条记录
   *
   * 重要事实（按当前实现）：
   * - 代码逻辑是“seen.has(mac) 就跳过后续记录”，所以保留的是 tableData 中第一次出现的那条。
   * - 这是不是“最新”取决于 tableData 的顺序：
   *   - 如果 tableData 是“新数据插入到数组头部”，则第一次看到是最新。
   *   - 如果 tableData 是“新数据 push 到尾部”，则第一次看到是最旧。
   * - 这里只做注解，不修改。
   *
   * 流向：filteredData 的输入基础
   */
  const bleLatestList = useMemo(() => {
    const seen = new Map<string, any>();

    for (const row of tableData) {
      const mac = row?.mac;
      if (!mac) continue;

      // 仅当第一次出现该 mac 时记录该行
      if (!seen.has(mac)) seen.set(mac, row);
    }

    // 输出去重后的列表，并按 MAC 字符串排序
    return Array.from(seen.values()).sort((a, b) =>
      String(a.mac).localeCompare(String(b.mac))
    );
  }, [tableData]);

  /* ============================================================
     7) BLE 数据过滤（基于 bleLatestList）
  ============================================================ */

  /**
   * filteredData：
   * - 数据来源：
   *   - bleLatestList（每 MAC 一条）
   *   - macFilter/devTypeFilter/frameTypeFilter/dataTypeFilter/isLocateView
   * - 用途：作为 BLE 表格 dataSource
   * - 流向：Table dataSource（非 locate 视图时）
   */
  const filteredData = bleLatestList.filter((row) => {
    /**
     * rawObj / parsedObj：
     * - 数据来源：row.raw / row.parsed（字符串）
     * - 用途：用于识别设备类型和广播类型，以及 JSON 格式渲染
     * - 流向：detectDevType/detectFrameType
     */
    const rawObj = safeJsonParse(row.raw);
    const parsedObj = safeJsonParse(row.parsed);

    /**
     * rowDev：设备类型
     * - 数据来源：detectDevType(rawObj, parsedObj)
     * - 用途：devTypeFilter 过滤
     */
    const rowDev = detectDevType(rawObj, parsedObj);

    /**
     * rowFrame：广播类型
     * - 数据来源：detectFrameType(rawObj, parsedObj)
     * - 用途：frameTypeFilter 过滤（仅 BLE 视图时）
     */
    const rowFrame = detectFrameType(rawObj, parsedObj);

    // MAC 模糊过滤（不区分大小写）
    if (
      macFilter &&
      !row.mac.toLowerCase().includes(macFilter.toLowerCase())
    )
      return false;

    // 设备类型过滤（all 表示不过滤）
    if (devTypeFilter !== "all" && rowDev !== devTypeFilter) return false;

    /**
     * 广播类型过滤：
     * - locate 视图不走 BLE 表，所以这里加 !isLocateView 保护
     * - frameTypeFilter=all 表示不过滤
     */
    if (
      !isLocateView &&
      frameTypeFilter !== "all" &&
      rowFrame !== frameTypeFilter
    )
      return false;

    /**
     * 数据类型过滤（raw/parsed/all）：
     * - all：不限制 raw/parsed 是否存在
     * - raw：要求 row.raw 有值
     * - parsed：要求 row.parsed 有值
     * 注意：locate 视图禁用 dataTypeFilter，但这里仍会跑，
     *      由于 !isLocateView 的 showRaw/showParsed 控制列，这里只是过滤行。
     */
    if (dataTypeFilter === "raw" && !row.raw) return false;
    if (dataTypeFilter === "parsed" && !row.parsed) return false;

    return true;
  });

  /* ============================================================
     8) 定位结果过滤（LocateResultService）
  ============================================================ */

  /**
   * locateFiltered：
   * - 数据来源：locateList（定位结果数组）
   * - 用途：定位表格 dataSource
   * - 流向：Table dataSource（locate 视图时）
   */
  const locateFiltered = locateList.filter((rec) => {
    // MAC 模糊过滤
    if (macFilter && !rec.mac.toLowerCase().includes(macFilter.toLowerCase()))
      return false;

    // 设备类型过滤（如果 rec.devType 有值才参与过滤）
    if (devTypeFilter !== "all" && rec.devType && rec.devType !== devTypeFilter)
      return false;

    return true;
  });

  /* ============================================================
     9) raw / parsed 列显隐（只对 BLE 表有效）
  ============================================================ */

  /**
   * showRaw：
   * - 数据来源：isLocateView + dataTypeFilter
   * - 用途：决定 BLE 表格是否显示 raw 列
   * - 流向：bleColumns push raw 列
   */
  const showRaw =
    !isLocateView && (dataTypeFilter === "all" || dataTypeFilter === "raw");

  /**
   * showParsed：
   * - 数据来源：isLocateView + dataTypeFilter
   * - 用途：决定 BLE 表格是否显示 parsed 列
   * - 流向：bleColumns push parsed 列
   */
  const showParsed =
    !isLocateView &&
    (dataTypeFilter === "all" || dataTypeFilter === "parsed");

  /* ----------------- BLE raw 列渲染 ----------------- */
  /**
   * renderRawText：
   * - 输入：text（row.raw 字符串）
   * - 数据来源：BLE row.raw
   * - 用途：根据 displayMode 决定是否格式化为 JSON
   * - 输出：<pre> 展示字符串或 JSON pretty print
   * - 流向：bleColumns 中 raw 列的 render
   */
  const renderRawText = (text: string) => {
    const json = safeJsonParse(text);

    if (displayMode === "json" && json) {
      return (
        <pre
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            margin: 0,
            fontSize: 12,
          }}
        >
          {JSON.stringify(json, null, 2)}
        </pre>
      );
    }

    return (
      <pre
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          margin: 0,
          fontSize: 12,
        }}
      >
        {text}
      </pre>
    );
  };

  /* ----------------- BLE parsed 列渲染 ----------------- */
  /**
   * renderParsedText：
   * - 输入：text（row.parsed 字符串）
   * - 数据来源：BLE row.parsed
   * - 用途：同 renderRawText，但针对 parsed 字段
   * - 流向：bleColumns 中 parsed 列的 render
   */
  const renderParsedText = (text: string) => {
    const parsedObj = safeJsonParse(text);

    if (displayMode === "json" && parsedObj) {
      return (
        <pre
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            margin: 0,
            fontSize: 12,
          }}
        >
          {JSON.stringify(parsedObj, null, 2)}
        </pre>
      );
    }

    return (
      <pre
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          margin: 0,
          fontSize: 12,
        }}
      >
        {text}
      </pre>
    );
  };

  /* ----------------- BLE 表格列 ----------------- */
  /**
   * bleColumns：
   * - 数据来源：
   *   - 基础列固定：time/mac/rssi
   *   - showRaw/showParsed 决定是否追加 raw/parsed 列
   * - 用途：传给 Antd Table 的 columns
   * - 流向：Table columns（非 locate 视图）
   */
  const bleColumns: any[] = [
    { title: "时间", dataIndex: "time", width: 100 }, // row.time 来自 BLE service 写入
    { title: "MAC", dataIndex: "mac", width: 150 }, // row.mac 来自 BLE service 写入
    { title: "RSSI", dataIndex: "rssi", width: 80 }, // row.rssi 来自 BLE service 写入
  ];

  // 按 showRaw 决定是否显示 raw 列
  if (showRaw) {
    bleColumns.push({
      title: "原始数据(raw)",
      dataIndex: "raw", // row.raw 字符串
      width: 380,
      render: renderRawText,
    });
  }

  // 按 showParsed 决定是否显示 parsed 列
  if (showParsed) {
    bleColumns.push({
      title: "解析数据(parsed)",
      dataIndex: "parsed", // row.parsed 字符串
      width: 380,
      render: renderParsedText,
    });
  }

  /* ----------------- LocateResult 定位信息渲染 ----------------- */
  /**
   * renderLocateInfo：
   * - 输入：rec（LocateRecord）
   * - 数据来源：locateService.results 的 value
   * - 用途：以 <pre> 形式展示整条 record 的 JSON
   * - displayMode=string：JSON.stringify(rec)（无缩进，字符串更紧凑）
   * - displayMode=json：JSON.stringify(rec,null,2)（格式化）
   * - 流向：locateColumns 的 render
   */
  const renderLocateInfo = (rec: LocateRecord) => {
    if (displayMode === "string") {
      return (
        <pre
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            margin: 0,
            fontSize: 12,
          }}
        >
          {JSON.stringify(rec)}
        </pre>
      );
    }

    return (
      <pre
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          margin: 0,
          fontSize: 12,
        }}
      >
        {JSON.stringify(rec, null, 2)}
      </pre>
    );
  };

  /* ----------------- LocateResult 表格列 ----------------- */
  /**
   * locateColumns：
   * - 数据来源：定位记录字段（ts/mac/x/y/rssi 等）
   * - 用途：定位结果表格 columns
   * - 流向：Table columns（locate 视图）
   */
  const locateColumns: any[] = [
    {
      title: "时间",
      dataIndex: "ts", // LocateRecord.ts：通常是毫秒时间戳
      width: 120,
      render: (ts?: number) => (ts ? new Date(ts).toLocaleTimeString() : "-"),
    },
    { title: "MAC", dataIndex: "mac", width: 180 }, // rec.mac：目标设备 MAC
    { title: "X (m)", dataIndex: "x", width: 80 }, // rec.x：定位坐标 X（米）
    { title: "Y (m)", dataIndex: "y", width: 80 }, // rec.y：定位坐标 Y（米）
    { title: "RSSI", dataIndex: "rssi", width: 80 }, // rec.rssi：可能是用于定位的综合 RSSI
    {
      title: "定位信息(JSON)",
      dataIndex: "_json", // 实际不依赖该字段，仅用 render 输出整个 rec
      render: (_: any, rec: LocateRecord) => renderLocateInfo(rec),
    },
  ];

  /**
   * totalCount / displayCount：
   * - 数据来源：当前视图（isLocateView）决定统计哪一类列表
   * - 用途：Card 标题处显示“总条数”和“过滤后显示条数”
   * - 流向：UI 文案
   */
  const totalCount = isLocateView ? locateList.length : bleLatestList.length;
  const displayCount = isLocateView ? locateFiltered.length : filteredData.length;

  /* ============================================================
     UI 渲染
  ============================================================ */
  return (
    <div style={{ padding: "0 16px 16px" }}>
      {/* 页面标题区 */}
      <Space orientation="vertical" size={8} style={{ marginBottom: 8 }}>
        <Space align="center">
          <Title level={4} style={{ margin: 0 }}>
            画面一 · 实时数据列表
          </Title>
        </Space>
      </Space>

      <Row gutter={16}>
        {/* 左侧过滤区 */}
        <Col xs={24} md={3}>
          <Card title="过滤条件" size="small">
            <Space orientation="vertical" size={12} style={{ width: "100%" }}>
              {/* MAC 过滤输入框
                  输入数据来源：用户输入事件 e.target.value
                  流向：setMacFilter -> filteredData/locateFiltered
               */}
              <div>
                <Text strong>MAC（模糊匹配）</Text>
                <Input
                  value={macFilter}
                  onChange={(e) => setMacFilter(e.target.value.trim())}
                  placeholder="例如 24 或 30"
                  style={{ marginTop: 4 }}
                />
              </div>

              {/* 设备类型过滤下拉
                  数据来源：用户选择值
                  流向：setDevTypeFilter -> frameTypeOptions -> frameTypeFilter 可能自动修正 -> 过滤
               */}
              <div>
                <Text strong>设备类型</Text>
                <Select
                  value={devTypeFilter}
                  onChange={setDevTypeFilter}
                  style={{ width: "100%", marginTop: 4 }}
                >
                  <Option value="all">全部</Option>
                  <Option value="BEACON">Beacon</Option>
                  <Option value="MBT02">MBT02</Option>
                  <Option value="MWC01">MWC01</Option>
                </Select>
              </div>

              {/* 广播类型过滤下拉
                  数据来源：frameTypeOptions（由 devTypeFilter 派生）
                  流向：setFrameTypeFilter -> isLocateView -> 选择表格/过滤逻辑
               */}
              <div>
                <Text strong>广播类型</Text>
                <Select
                  value={frameTypeFilter}
                  onChange={setFrameTypeFilter}
                  style={{ width: "100%", marginTop: 4 }}
                >
                  {frameTypeOptions.map((o) => (
                    <Option key={o.value} value={o.value}>
                      {o.label}
                    </Option>
                  ))}
                </Select>
              </div>

              {/* 数据类型（只对 BLE 生效）
                  disabled={isLocateView}：定位视图不展示 raw/parsed 列概念
                  流向：setDataTypeFilter -> showRaw/showParsed + filteredData
               */}
              <div>
                <Text strong>数据类型</Text>
                <Select
                  value={dataTypeFilter}
                  onChange={setDataTypeFilter}
                  style={{ width: "100%", marginTop: 4 }}
                  disabled={isLocateView}
                >
                  <Option value="all">全部</Option>
                  <Option value="raw">只看原始数据</Option>
                  <Option value="parsed">只看解析数据</Option>
                </Select>
              </div>

              {/* 显示模式：string/json
                  流向：setDisplayMode -> renderRawText/renderParsedText/renderLocateInfo
               */}
              <div>
                <Text strong>显示模式</Text>
                <Select
                  value={displayMode}
                  onChange={setDisplayMode}
                  style={{ width: "100%", marginTop: 4 }}
                >
                  <Option value="string">紧凑字符串</Option>
                  <Option value="json">JSON 格式</Option>
                </Select>
              </div>
            </Space>
          </Card>
        </Col>

        {/* 右侧表格 */}
        <Col xs={24} md={21}>
          <Card
            size="small"
            title={
              <Space orientation="vertical" size={0}>
                <Text strong>
                  {isLocateView
                    ? "定位结果列表（LocateResultService）"
                    : "实时数据列表（BLE 广播）"}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  共 {totalCount} 条，当前显示 {displayCount} 条。
                </Text>
              </Space>
            }
            /**
             * extra：
             * - 只在 BLE 视图时显示“清空列表”
             * - locate 视图不提供清空按钮（因为定位结果缓存策略由 locateService 决定）
             */
            extra={
              !isLocateView && (
                <Button size="small" onClick={handleClear}>
                  清空列表
                </Button>
              )
            }
          >
            <Table<any>
              /**
               * columns：
               * - locate 视图：locateColumns
               * - BLE 视图：bleColumns（可能包含 raw/parsed 列）
               */
              size="small"
              columns={isLocateView ? locateColumns : bleColumns}
              /**
               * dataSource：
               * - locate 视图：locateFiltered（来自 locateService）
               * - BLE 视图：filteredData（来自 bluetoothDataService）
               */
              dataSource={isLocateView ? locateFiltered : filteredData}
              pagination={false} // 实时表通常不分页，避免频繁切页
              scroll={{ y: 750 }} // 限制表格高度，出现滚动条
              style={{ tableLayout: "fixed" }} // 固定列布局，减少抖动
              /**
               * rowKey：
               * - 数据来源：row.mac 或 row.key
               * - 用途：React 列表渲染的稳定 key，减少重排
               * - 流向：React reconciliation
               *
               * 注意：
               * - BLE 表按 mac 去重后，mac 可作为 key
               * - locate 表如果同一 mac 会重复更新，仍用 mac 作为 key 会“覆盖同一行”，
               *   但你这里 locateList 本身是 results map 的 values，所以天然是“每 mac 一行最新值”
               */
              rowKey={(row: any) => row.mac ?? row.key ?? `${row.mac}_${row.ts ?? ""}`}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default RealtimeData;
