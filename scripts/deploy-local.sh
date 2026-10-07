#!/usr/bin/env bash
# 本机一键更新：构建前端 → 发布到后端 static → 打 JAR → 重启 127.0.0.1:8080。
# 仅供本机使用；不推送、不部署到其他机器。
set -euo pipefail

web_dir="$(cd "$(dirname "$0")/.." && pwd)"
server_dir="${CLOSET_SERVER_DIR:-$(cd "$web_dir/../smart-closet-server" && pwd)}"
# 本机额外环境变量（KEY=VALUE 每行一条），例如 CLOSET_MANAGEMENT_ENABLED=true
env_file="$server_dir/.local/deploy.env"
if [[ -f "$env_file" ]]; then set -a; source "$env_file"; set +a; fi
# 后端默认关闭快录，本机使用需要开启
export CLOSET_QUICK_INTAKE_ENABLED="${CLOSET_QUICK_INTAKE_ENABLED:-true}"
port="${PORT:-8080}"
agent_port="${CLOSET_AGENT_PORT:-8091}"
deploy_dir="$server_dir/.local/deploy"
jar="$deploy_dir/smart-closet-server.jar"
log="$deploy_dir/server.log"
# 本机代理环境变量会让 curl 健康检查绕去代理
export NO_PROXY="127.0.0.1,localhost${NO_PROXY:+,$NO_PROXY}" no_proxy="127.0.0.1,localhost${no_proxy:+,$no_proxy}"

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
listener() { lsof -nP -t -iTCP:"$1" -sTCP:LISTEN 2>/dev/null || true; }

[[ -f "$server_dir/pom.xml" ]] || { echo "找不到后端目录：${server_dir}" >&2; exit 1; }

step '构建前端并发布到后端 static'
(cd "$web_dir" && npm run build:server)

step '打包后端 JAR'
mvn_args=(-q -f "$server_dir/pom.xml" package)
[[ "${WITH_TESTS:-}" == 1 ]] || mvn_args+=(-DskipTests)
mvn "${mvn_args[@]}"
built="$(ls -t "$server_dir"/target/smart-closet-server-*.jar | grep -v '\.original$' | head -1)"

step '停止旧服务'
pkill -f "$server_dir/scripts/start-with-agent.sh" 2>/dev/null || true
pkill -f 'bash scripts/start-with-agent.sh' 2>/dev/null || true
for p in "$port" "$agent_port"; do
  pids="$(listener "$p")"
  [[ -n "$pids" ]] && kill $pids 2>/dev/null || true
done
for _ in {1..50}; do
  [[ -z "$(listener "$port")$(listener "$agent_port")" ]] && break
  sleep 0.2
done
for p in "$port" "$agent_port"; do
  pids="$(listener "$p")"
  [[ -n "$pids" ]] && { echo "端口 $p 未释放，强制结束 $pids"; kill -9 $pids 2>/dev/null || true; }
done

# 复制一份再运行，之后重新 mvn package 不会覆盖正在运行的 JAR
mkdir -p "$deploy_dir"
cp "$built" "$jar"

step "启动服务（日志：${log}）"
cd "$server_dir"
CLOSET_SERVER_JAR="$jar" nohup bash scripts/start-with-agent.sh >"$log" 2>&1 &
launcher=$!
disown

for _ in {1..120}; do
  if curl --silent --fail --max-time 2 "http://127.0.0.1:$port/api/health" >/dev/null; then
    step "已就绪：http://127.0.0.1:$port"
    exit 0
  fi
  kill -0 "$launcher" 2>/dev/null || { echo '启动失败，最近日志：' >&2; tail -40 "$log" >&2; exit 1; }
  sleep 1
done
echo '120 秒内未就绪，最近日志：' >&2
tail -40 "$log" >&2
exit 1
