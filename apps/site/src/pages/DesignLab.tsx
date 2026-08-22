import { useState } from "react";
import {
  Activity,
  BellRing,
  Bot,
  Building2,
  CheckCircle2,
  ChevronRight,
  Gauge,
  Link2,
  MessageCircle,
  RadioTower,
  ShieldCheck,
  SlidersHorizontal,
  ThermometerSun,
  Wifi,
} from "lucide-react";
import heroImage from "../assets/greenhouse-aiot-hero.jpg";
import { useLanguage } from "../contexts/LanguageContext";
import "../design/design-lab.css";

const directions = [
  {
    id: "industrial",
    label: "工业级 AIoT",
    tone: "强冲击 / 暗色 / 现场监控",
    headline: "让每一座棚，|都能被随时看见、|问到、控制。",
    lead: "把温室状态、语音指令、设备动作和报警闭环收进一个轻量节点。棚主继续用微信，园区得到可验证的运行数据。",
    cta: "查看运行演示",
    secondary: "打开配置台",
    metrics: [
      ["31.2°C", "1号棚温度"],
      ["10 min", "通风执行"],
      ["2.1s", "意图响应"],
    ],
  },
  {
    id: "saas",
    label: "明亮企业 SaaS",
    tone: "清晰 / 模块化 / 合作方友好",
    headline: "温室远程运维，|从微信对话变成|可管理系统。",
    lead: "面向园区试点、渠道合作和规模部署，把模型、语音、MQTT、平台绑定拆成清晰模块，状态和风险一眼可读。",
    cta: "查看价值链路",
    secondary: "配置集成",
    metrics: [
      ["2 座", "当前试点棚"],
      ["4 类", "核心能力"],
      ["0 mock", "真实 LLM"],
    ],
  },
  {
    id: "natural",
    label: "自然农业场景",
    tone: "真实 / 温和 / 农事价值",
    headline: "少跑一趟棚，|也不错过|一次变天。",
    lead: "用农场主熟悉的微信承接温湿度查询、通风控制和定时汇报，让技术隐藏在日常农事后面。",
    cta: "看农事闭环",
    secondary: "连接设备",
    metrics: [
      ["72%", "湿度"],
      ["已关闭", "侧帘状态"],
      ["07:00", "早报时间"],
    ],
  },
] as const;

const capabilities = [
  { icon: MessageCircle, title: "微信问棚", text: "自然语言查询温湿度、设备和报警。" },
  { icon: SlidersHorizontal, title: "远程控棚", text: "通风、风机等动作先确认再下发。" },
  { icon: BellRing, title: "主动报警", text: "温湿异常、设备离线及时推送。" },
  { icon: ShieldCheck, title: "可追溯", text: "每次指令、操作者和执行结果可查。" },
];

const integrationCards = [
  { icon: MessageCircle, name: "微信 ClawBot", status: "已连接", active: true },
  { icon: Building2, name: "企业微信", status: "预留", active: false },
  { icon: RadioTower, name: "短信 / 电话", status: "预留", active: false },
];

export default function DesignLab() {
  const { t } = useLanguage();
  const [activeId, setActiveId] = useState<(typeof directions)[number]["id"]>("natural");
  const active = directions.find((item) => item.id === activeId) ?? directions[0];

  return (
    <div className={`design-lab lab-${active.id}`}>
      <section className="lab-intro">
        <p className="lab-kicker">Design Lab · {t("brand")}</p>
        <h1>{t("design.lab.title") || "Three Web Visual Direction Previews"}</h1>
        <p>
          自然农业场景已落到正式首页和配置台。这里保留三套候选方向，便于后续比较首页叙事、配置台信息架构和集成中心表达。
        </p>
      </section>

      <div className="direction-tabs" role="tablist" aria-label="设计方向">
        {directions.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === active.id ? "active" : ""}
            onClick={() => setActiveId(item.id)}
            role="tab"
            aria-selected={item.id === active.id}
          >
            <span>{item.label}</span>
            <small>{item.tone}</small>
          </button>
        ))}
      </div>

      <section className="concept-hero" aria-label={`${active.label} 首页预览`}>
        <img src={heroImage} alt="温室内的传感器与边缘节点" />
        <div className="concept-hero-overlay" />
        <div className="concept-copy">
          <p className="lab-kicker">{active.label}</p>
          <h2>
            {active.headline.split("|").map((line) => (
              <span key={line}>{line}</span>
            ))}
          </h2>
          <p>{active.lead}</p>
          <div className="concept-actions">
            <button type="button" className="lab-btn primary">
              <Activity size={17} aria-hidden />
              {active.cta}
            </button>
            <button type="button" className="lab-btn ghost">
              <Gauge size={17} aria-hidden />
              {active.secondary}
            </button>
          </div>
        </div>
        <div className="live-console" aria-label="产品运行演示">
          <div className="console-top">
            <span>deployment / entity</span>
            <strong>Live</strong>
          </div>
          <div className="sensor-grid">
            {active.metrics.map(([value, label]) => (
              <div key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="chat-surface">
            <p className="bubble user">1号棚现在状态如何？</p>
            <p className="bubble bot">温度 31.2°C，湿度 72%，侧帘已关闭。</p>
            <p className="bubble user">打开通风 10 分钟</p>
            <p className="bubble bot">已生成指令，等待确认后下发。</p>
          </div>
        </div>
      </section>

      <section className="lab-section">
        <div className="section-heading">
          <p className="lab-kicker">Product Story</p>
          <h2>首页应该让用户先看到“为什么值得用”</h2>
        </div>
        <div className="capability-row">
          {capabilities.map((item) => (
            <article key={item.title} className="capability-tile">
              <item.icon size={22} aria-hidden />
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
        <div className="validation-band">
          <div>
            <span>试点验证</span>
            <strong>跑棚次数、报警响应、远程执行成功率</strong>
          </div>
          <div>
            <span>合作视角</span>
            <strong>可复制节点、可审计日志、可扩展集成</strong>
          </div>
          <ChevronRight size={24} aria-hidden />
        </div>
      </section>

      <section className="lab-section console-preview" aria-label="配置台预览">
        <div className="section-heading">
          <p className="lab-kicker">Operator Console</p>
          <h2>配置台改为专业运维控制台</h2>
        </div>
        <div className="ops-layout">
          <aside className="ops-nav" aria-label="配置台导航预览">
            <button type="button" className="active">
              <Gauge size={17} aria-hidden />
              总览
            </button>
            <button type="button">
              <Bot size={17} aria-hidden />
              AI / STT
            </button>
            <button type="button">
              <Wifi size={17} aria-hidden />
              MQTT
            </button>
            <button type="button">
              <Link2 size={17} aria-hidden />
              集成中心
            </button>
          </aside>

          <div className="ops-main">
            <div className="ops-status">
              <StatusTile icon={CheckCircle2} label="API" value="ok" state="ok" />
              <StatusTile icon={Bot} label="LLM" value="deepseek-v4-flash" state="ok" />
              <StatusTile icon={ThermometerSun} label="STT" value="通道转写" state="idle" />
              <StatusTile icon={Wifi} label="MQTT" value="127.0.0.1:1883" state="ok" />
            </div>

            <div className="ops-panels">
              <section className="ops-panel">
                <h3>AI 意图配置</h3>
                <div className="field-grid">
                  <PreviewField label="提供商" value="DeepSeek" />
                  <PreviewField label="模型" value="deepseek-v4-flash" />
                  <PreviewField label="Base URL" value="https://api.deepseek.com/v1" />
                  <PreviewField label="API Key" value="************a66b" />
                </div>
                <button type="button" className="lab-btn compact">
                  保存配置
                </button>
              </section>

              <section className="ops-panel">
                <h3>集成中心</h3>
                <div className="integration-grid">
                  {integrationCards.map((item) => (
                    <article
                      key={item.name}
                      className={item.active ? "integration-card active" : "integration-card"}
                    >
                      <item.icon size={20} aria-hidden />
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.status}</span>
                      </div>
                    </article>
                  ))}
                </div>
                <p className="ops-note">
                  微信绑定不再压在密钥表单前面；后续平台按统一集成卡片扩展。
                </p>
              </section>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatusTile({
  icon: Icon,
  label,
  value,
  state,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: string;
  state: "ok" | "idle";
}) {
  return (
    <div className={`status-tile ${state}`}>
      <Icon size={20} aria-hidden />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <label className="preview-field">
      <span>{label}</span>
      <input value={value} readOnly />
    </label>
  );
}
