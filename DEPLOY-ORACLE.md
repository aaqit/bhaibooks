# BahiBooks ERP — Oracle Cloud Always Free par LIVE karna (₹0)

Ye guide aapko step-by-step **free forever** server par app live karwati hai.
Aakhir me aapko ek public link milega (jaise `http://130.61.xx.xx`) jahan se
duniya bhar se koi bhi login kar sakega.

> Pehle `git push` ho chuka hona chahiye (code GitHub par ho). Uske baad ye steps.

---

## 0. Kya-kya chahiye
- Oracle Cloud account (free — card sirf verification ke liye, charge nahi)
- GitHub repo ka URL
- 20–30 minute

---

## 1. Oracle Cloud account banao
1. Jao: https://signup.cloud.oracle.com
2. Country: **India**, email + mobile verify karo.
3. Payment: card daalo (sirf verify hota hai, **Always Free** me charge nahi).
4. **Home Region** chuno: **Mumbai (ap-mumbai-1)** ya **Hyderabad (ap-hyderabad-1)**
   (ya jo bhi sabse nazdeek ho). Ye region baad me badal nahi sakti — dhyaan se chuno.

---

## 2. VM (server) banao
1. Console me: **Compute → Instances → Create instance**
2. **Name:** `bahibooks`
3. **Image:** *Canonical Ubuntu* → **Ubuntu 24.04**
4. **Shape** (ye important hai):
   - *Change shape* → **Ampere** → `VM.Standard.A1.Flex`
   - **4 OCPU / 24 GB RAM** (ye poora Always Free me aata hai)
   - Agar "out of capacity" error aaye to `1 OCPU / 6 GB` try karo, ya thodi der baad phir.
5. **Networking:** *Create new VCN* wala default chhodo (Public subnet auto ban jata hai)
   - **Assign a public IPv4 address: YES** (check karo)
6. **SSH keys:** *Generate a key pair for me* → **private key download karo** (`ssh-key-....key`)
   - Ye file safe rakho — iske bina server me ghus nahi paoge.
7. **Create** dabao. 1–2 minute me **Public IP address** milega. Note kar lo (jaise `130.61.45.10`).

---

## 3. Ports kholo (2 jagah)
### 3a. Oracle Security List
1. Instance par click → **Primary VNIC** → **Subnet** → **Security Lists** → default list
2. **Add Ingress Rules** — do baar:
   - Source CIDR `0.0.0.0/0`, IP Protocol **TCP**, Destination Port **80**
   - Source CIDR `0.0.0.0/0`, IP Protocol **TCP**, Destination Port **443**

### 3b. Server ke andar iptables (Oracle ka jaal)
SSH se andar jaake ye chalao (step 4 ke baad):
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

---

## 4. Server me SSH karo
Windows PowerShell me (jo folder me `.key` file hai wahan se):
```powershell
ssh -i "ssh-key-2026-xx-xx.key" ubuntu@PUBLIC_IP
```
Pehli baar `yes` likhna padega.

---

## 5. Docker + Git install
```bash
sudo apt-get update
sudo apt-get install -y git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
newgrp docker
sudo apt-get install -y docker-compose-plugin
```

---

## 6. App deploy karo
```bash
git clone https://github.com/AAPKA-USERNAME/AAPKA-REPO.git bahibooks
cd bahibooks
cp .env.example .env
```
`.env` me strong secret daalo (aur DOMAIN set karo — neeche dekho):
```bash
sed -i "s|change-this-to-a-long-random-string|$(openssl rand -hex 48)|" .env
```
Ab build + start:
```bash
sudo docker compose up -d --build
```
Pehli baar 2–4 minute lagega (Node 24 image + client build).

Check karo:
```bash
sudo docker compose ps
curl -s http://localhost/api/health
```

---

## 7. Website kholo
Browser me: **`http://PUBLIC_IP`**

Login: `admin` / `admin123` (pehli baar), phir turant password change karo.

---

## 8. FREE HTTPS (`https://`) — sslip.io trick
Domain kharidne ki zarurat nahi. Apni IP ko dashes me likho:
```
IP = 130.61.45.10   →   DOMAIN = 130-61-45-10.sslip.io
```
`.env` me:
```
DOMAIN=130-61-45-10.sslip.io
```
Phir restart:
```bash
sudo docker compose down
sudo docker compose up -d
```
Caddy apne aap Let's Encrypt se **valid HTTPS certificate** le lega.
Ab link: **`https://130-61-45-10.sslip.io`**

---

## 9. Rozmarra ke commands
```bash
cd ~/bahibooks
sudo docker compose logs -f        # live logs dekho
sudo docker compose restart        # restart
sudo docker compose down           # band
sudo docker compose up -d --build  # naya code deploy
git pull && sudo docker compose up -d --build   # GitHub se update
```

---

## 10. Data (database) kahan hai
Server par data Docker volume me rehta hai: `bahibooks-data` → `/data` ke andar
`master.db` + `companies/COMP_XXXX/company.db`.

Backup lene ke liye:
```bash
sudo docker run --rm -v bahibooks-data:/data -v $PWD:/backup alpine \
  tar czf /backup/bahibooks-backup-$(date +%F).tar.gz -C /data .
```
Ye `~/bahibooks/bahibooks-backup-YYYY-MM-DD.tar.gz` bana dega — ise PC par bhi rakh lo.

**Purana data PC se server par le jaana ho** to apne PC ke `data/` folder ko
server ke volume me copy kar do (ya app ke andar backup/restore feature use karo).

---

## Zaroori baatein
- **VM ko kabhi "Terminate" mat karna** — Always Free me ye hamesha free rehti hai,
  lekin delete karne par data bhi chala jayega.
- **PC app** alag hai: `release\BahiBooks ERP Setup 1.0.0.exe` — ise kisi bhi
  Windows 10+ PC par install kar sakte ho (server chahiye nahi, offline chalti hai).
- Har PC ka apna local data hota hai. Server wala data sabka shared hota hai.
