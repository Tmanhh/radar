# Hồ sơ team

`team.json` — chỉ có id và tên. Không nhạy cảm, commit được.
`secret.json` — địa chỉ Web App và token của team. **KHÔNG commit.** `.gitignore` đã chặn.

Định dạng `secret.json`:

```json
{
  "webAppUrl": "https://script.google.com/macros/s/.../exec",
  "token": "chuỗi ngẫu nhiên riêng của team"
}
```

Sinh token: `openssl rand -hex 24`

Sheet ID **không** nằm ở đây. Nó nằm trong Apps Script trên máy chủ Google,
nên app không biết Sheet nào. Đó là điểm khiến cách này chặt hơn service account.

## Build

Cục bộ:  `node build-team.js S1 --mac`
Trên CI: đọc từ GitHub Secrets `TEAM_S1` ... `TEAM_S4`, nội dung là cả file secret.json
