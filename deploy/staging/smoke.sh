#!/usr/bin/env bash
# STAGING smoke test (through the production Caddy, on the server itself, never via the internet).
# Checks: the password layer refuses an anonymous request, the app answers behind it, the API is
# healthy, and the PRODUCTION site still answers exactly as before (login 200, API 401).
set -euo pipefail
ROOT=/home/manage/manage-staging
auth="$(cat "$ROOT/secrets/basic-auth.txt")"
code() { curl -sk -o /dev/null -w '%{http_code}' --max-time 30 "$@"; }
s=https://staging.managebyhedax.ir
p=https://managebyhedax.ir
anon=$(code --resolve staging.managebyhedax.ir:443:127.0.0.1 "$s/login")
login=$(code --resolve staging.managebyhedax.ir:443:127.0.0.1 -u "$auth" "$s/login")
apiNoSession=$(code --resolve staging.managebyhedax.ir:443:127.0.0.1 -u "$auth" "$s/api/v1/cases")
prodLogin=$(code --resolve managebyhedax.ir:443:127.0.0.1 "$p/login")
prodApi=$(code --resolve managebyhedax.ir:443:127.0.0.1 "$p/api/v1/cases")
health="$(docker exec manage-staging-staging-api-1 node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>r.json()).then(j=>console.log(JSON.stringify({status:j.status,db:j.db,version:j.version,commit:j.commit,environment:j.environment})))")"
echo "{\"stagingAnonymous\":$anon,\"stagingLogin\":$login,\"stagingApiWithoutSession\":$apiNoSession,\"productionLogin\":$prodLogin,\"productionApiWithoutSession\":$prodApi,\"stagingHealth\":$health}"
[ "$anon" = 401 ] && [ "$login" = 200 ] && [ "$apiNoSession" = 401 ] && [ "$prodLogin" = 200 ] && [ "$prodApi" = 401 ]
