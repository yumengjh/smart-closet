#!/usr/bin/env bash
# Build the site and replace the 1Panel static site over SSH (used by .semaphore/deploy.yml). Same steps as
# .github/workflows/deploy.yml and the CircleCI deploy job; the tests have already run in the checks pipeline.
#
# Secret "frontend" (Semaphore organization; the web server is not the backend server): DEPLOY_SSH_HOST, DEPLOY_SSH_USER, DEPLOY_SSH_KEY or DEPLOY_SSH_PASSWORD;
# optional DEPLOY_SSH_PORT, DEPLOY_SSH_KNOWN_HOSTS, DEPLOY_PATH (default /opt/1panel/www/sites/yuda.yumg.cn/index),
# DEPLOY_SITE_URL (default https://yuda.yumg.cn/), FRONTEND_API_BASE_URL,
# TENCENTCLOUD_SECRET_ID + TENCENTCLOUD_SECRET_KEY + CDN_PURGE_PATHS (refresh the CDN after deploy).
# Multi-line values (keys, known_hosts) may be stored as they are or base64-encoded on one line.
set -euo pipefail

missing=()
[ -n "${DEPLOY_SSH_HOST:-}" ] || missing+=(DEPLOY_SSH_HOST)
[ -n "${DEPLOY_SSH_USER:-}" ] || missing+=(DEPLOY_SSH_USER)
[ -n "${DEPLOY_SSH_KEY:-}${DEPLOY_SSH_PASSWORD:-}" ] || missing+=("DEPLOY_SSH_KEY 或 DEPLOY_SSH_PASSWORD")
[ ${#missing[@]} -eq 0 ] || { echo "缺少环境变量：${missing[*]}"; exit 1; }
DEPLOY_PATH=${DEPLOY_PATH:-/opt/1panel/www/sites/yuda.yumg.cn/index}
case "$DEPLOY_PATH" in /*/*/*) ;; *) echo "DEPLOY_PATH 太短，拒绝覆盖：$DEPLOY_PATH"; exit 1 ;; esac
SITE_URL=${DEPLOY_SITE_URL:-https://yuda.yumg.cn/}
API_BASE=${FRONTEND_API_BASE_URL:-}

# The site only works if its API answers: FRONTEND_API_BASE_URL (a separate API host, which must allow this site in the
# backend's CLOSET_CORS_ALLOWED_ORIGINS), or, when empty, a reverse proxy for /api on the site's own domain.
# Checked before building, so a site that cannot reach the backend is never deployed.
if [ -n "$API_BASE" ]; then
  case "$API_BASE" in https://*) ;; *) echo "FRONTEND_API_BASE_URL 必须是 https:// 开头的后端地址（不带路径）：$API_BASE"; exit 1 ;; esac
  api="${API_BASE%/}"; how="FRONTEND_API_BASE_URL"
else
  api="$(printf '%s' "$SITE_URL" | sed -E 's#^(https?://[^/]+).*#\1#')"; how="站点同域的 /api 反向代理"
fi
body=$(curl -sS -m 20 -H 'Accept: application/json' "$api/api/health" || true)
if printf '%s' "$body" | grep -q '"status" *: *"UP"'; then echo "API 可用（${how}）：${api}/api/health → $body"
else
  echo "$api/api/health 没有返回后端健康检查（收到：$(printf '%s' "$body" | tr -s '\n ' ' ' | head -c 100)）"
  if [ -z "$API_BASE" ]; then
    echo "未设置 FRONTEND_API_BASE_URL，页面会请求 $api/api，但该域名没有把 /api 转发到后端。二选一："
    echo "  1. 设置 FRONTEND_API_BASE_URL=后端的 https 地址，并在后端 .env 的 CLOSET_CORS_ALLOWED_ORIGINS 加入 ${api}"
    echo "  2. 在 1Panel 给站点加反向代理：/api → 后端地址（同域，无需 CORS）"
  fi
  exit 1
fi

# Build. Shown at the bottom of Settings: the tag on a tag build, else package.json's version.
export VITE_USE_MOCKS=false VITE_API_BASE_URL="$API_BASE" CLOSET_APP_VERSION=""
[ "${SEMAPHORE_GIT_REF_TYPE:-}" = tag ] && CLOSET_APP_VERSION="$SEMAPHORE_GIT_TAG_NAME"
npm run build
test -s dist/index.html
tar -C dist -czf site.tar.gz .
sha256sum dist/index.html | awk '{print $1}' > index.sha256
echo "构建完成：$(find dist -type f | wc -l) 个文件，$(du -sh dist | cut -f1)"

mkdir -p ~/.ssh && chmod 700 ~/.ssh
port=${DEPLOY_SSH_PORT:-22}
text() { case "$1" in *BEGIN*|*ssh-*|*ecdsa-*) printf '%s\n' "$1" ;; *) printf '%s' "$1" | base64 -d ;; esac; }
# A private key whose line breaks were lost on pasting: rebuild header, body and footer.
pem() {
  local v h f b; v=$(text "$1" | tr -d '\r'); h=$(printf '%s' "$v" | grep -o -- '-----BEGIN [A-Z ]*-----' | head -1)
  [ -n "$h" ] || { echo "私钥格式不对（没有 -----BEGIN ... -----）" >&2; return 1; }
  f=${h/BEGIN/END}; b=${v#*"$h"}; b=${b%%"$f"*}
  printf '%s\n' "$h"; printf '%s' "$b" | tr -d ' \t\n' | fold -w 64; printf '\n%s\n' "$f"
}
if [ -n "${DEPLOY_SSH_KNOWN_HOSTS:-}" ]; then
  # One "host type key" entry per line, even when the pasted lines (and ssh-keyscan's # comments) were joined.
  text "$DEPLOY_SSH_KNOWN_HOSTS" | tr -s ' \t\r\n' ' ' | awk '{for (i = 2; i < NF; i++) if ($i ~ /^(ssh-|ecdsa-|sk-)/ && $(i-1) != "#") print $(i-1), $i, $(i+1)}' > ~/.ssh/known_hosts
  echo "DEPLOY_SSH_KNOWN_HOSTS：$(wc -l < ~/.ssh/known_hosts | tr -d ' ') 条，类型 $(awk '{print $2}' ~/.ssh/known_hosts | sort -u | tr '\n' ' ')"
  name=$DEPLOY_SSH_HOST; [ "$port" = 22 ] || name="[$DEPLOY_SSH_HOST]:$port"
  # The host keys do not depend on the port: entries scanned without -p also serve [host]:port.
  if [ "$port" != 22 ] && ! ssh-keygen -F "$name" -f ~/.ssh/known_hosts >/dev/null && ssh-keygen -F "$DEPLOY_SSH_HOST" -f ~/.ssh/known_hosts >/dev/null; then
    ssh-keygen -F "$DEPLOY_SSH_HOST" -f ~/.ssh/known_hosts | grep -v '^#' | awk -v n="$name" '{$1 = n; print}' >> ~/.ssh/known_hosts
    echo "DEPLOY_SSH_KNOWN_HOSTS 的记录不带端口，已按端口 $port 补上"
  fi
  ssh-keygen -F "$name" -f ~/.ssh/known_hosts >/dev/null || { echo "DEPLOY_SSH_KNOWN_HOSTS 里没有与 DEPLOY_SSH_HOST（端口 $port）对应的记录：请用 ssh-keyscan -p $port <与 DEPLOY_SSH_HOST 完全相同的地址> 重新生成"; exit 1; }
else ssh-keyscan -p "$port" -T 15 "$DEPLOY_SSH_HOST" > ~/.ssh/known_hosts 2>/dev/null; echo "警告：未设置 DEPLOY_SSH_KNOWN_HOSTS，本次信任扫描到的主机指纹"; fi
opts=(-p "$port" -o ServerAliveInterval=30 -o ConnectTimeout=20 -o StrictHostKeyChecking=yes)
if [ -n "${DEPLOY_SSH_KEY:-}" ]; then
  pem "$DEPLOY_SSH_KEY" > ~/.ssh/deploy_key && chmod 600 ~/.ssh/deploy_key
  ssh-keygen -y -f ~/.ssh/deploy_key >/dev/null || { echo "DEPLOY_SSH_KEY 无法读取（格式不对或带了密码）"; exit 1; }
  opts+=(-i ~/.ssh/deploy_key -o IdentitiesOnly=yes); pre=""
else
  sudo apt-get update -qq >/dev/null && sudo apt-get install -y -qq sshpass >/dev/null
  pre="sshpass -e"; opts+=(-o PubkeyAuthentication=no)
fi
# sshpass -e reads SSHPASS.
printf '#!/usr/bin/env bash\nexport SSHPASS="${DEPLOY_SSH_PASSWORD:-}"\nexec %s ssh %s "%s@%s" "$@"\n' "$pre" "${opts[*]}" "$DEPLOY_SSH_USER" "$DEPLOY_SSH_HOST" > ~/remote && chmod +x ~/remote
printf '#!/usr/bin/env bash\nexport SSHPASS="${DEPLOY_SSH_PASSWORD:-}"\nexec %s scp %s "$@"\n' "$pre" "${opts[*]/-p/-P}" > ~/upload && chmod +x ~/upload
trap 'rm -f ~/.ssh/deploy_key' EXIT
~/remote 'echo "已连接 $(hostname)"'

tmp="/tmp/yuda-frontend-semaphore-${SEMAPHORE_WORKFLOW_ID:-$$}.tar.gz"
~/upload site.tar.gz "$DEPLOY_SSH_USER@$DEPLOY_SSH_HOST:$tmp"
~/remote "bash -s -- $(printf %q "$DEPLOY_PATH") $(printf %q "$tmp")" <<'REMOTE'
set -euo pipefail
target=$1; archive=$2
trap 'rm -f "$archive"' EXIT
[ -d "$target" ] || { echo "站点目录不存在：$target"; exit 1; }
SUDO=(); [ -w "$target" ] || SUDO=(sudo -n)
owner=$(stat -c '%u:%g' "$target")
# Unpack next to the site (same file system), keep the previous version for a manual rollback.
stage=$("${SUDO[@]}" mktemp -d "$(dirname "$target")/.deploy-XXXXXX")
"${SUDO[@]}" tar -xzf "$archive" -C "$stage"
[ -s "$stage/index.html" ] || { "${SUDO[@]}" rm -rf "$stage"; echo "上传的包里没有 index.html"; exit 1; }
"${SUDO[@]}" tar -czf "$(dirname "$target")/.index-previous.tar.gz" -C "$target" . 2>/dev/null || true
# Full overwrite: every old file goes, except 1Panel's protected .user.ini (chattr +i on PHP sites).
if command -v rsync >/dev/null; then
  "${SUDO[@]}" rsync -a --delete --exclude .user.ini "$stage/" "$target/"
else
  "${SUDO[@]}" find "$target" -mindepth 1 -maxdepth 1 ! -name .user.ini -exec rm -rf {} +
  "${SUDO[@]}" cp -a "$stage/." "$target/"
fi
"${SUDO[@]}" chown -R "$owner" "$target"
"${SUDO[@]}" rm -rf "$stage"
echo "已覆盖 ${target}：$(find "$target" -type f | wc -l) 个文件；上一版备份在 $(dirname "$target")/.index-previous.tar.gz"
REMOTE

# Tencent Cloud CDN in front of the site; skipped without TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY.
SITE_URL="$SITE_URL" node scripts/purge-cdn.mjs

want=$(cat index.sha256)
for _ in 1 2 3 4 5 6; do
  got=$(curl -fsSL --max-time 20 -H 'Cache-Control: no-cache' "$SITE_URL?deploy=${SEMAPHORE_WORKFLOW_ID:-x}" | sha256sum | awk '{print $1}' || true)
  [ "$got" = "$want" ] && { echo "线上 $SITE_URL 已是本次构建"; exit 0; }
  sleep 5
done
echo "警告：线上 index.html 与本次构建不一致（可能有 CDN 缓存，或 DEPLOY_SITE_URL 不对）"
