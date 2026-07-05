# ตั้งค่า Firebase และ Deploy ขึ้น Vercel (ฟรี)

## 1. สร้างโปรเจกต์ Firebase (ฟรี ไม่ต้องผูกบัตร)

1. ไปที่ https://console.firebase.google.com → **Add project** → ตั้งชื่อโปรเจกต์ (เช่น `portfolio-app`)
2. ในเมนูซ้าย: **Build → Authentication → Get started → Sign-in method → Email/Password** → เปิดใช้งาน
3. ในเมนูซ้าย: **Build → Firestore Database → Create database** → เลือก **Start in production mode** (rules จะ deploy ทับด้วยไฟล์ `firestore.rules` ที่เตรียมไว้ให้แล้ว) → เลือก region ใกล้ไทยที่สุด เช่น `asia-southeast1`
4. กลับไปหน้า **Project Overview** → กดไอคอน **</>" (Web app)** → ตั้งชื่อแอป → จะได้ค่า config มาเป็นก้อน JS
5. คัดลอกค่าจาก config ไปใส่ในไฟล์ `web/.env.local` (สร้างไฟล์นี้จาก `.env.local.example`):

```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

6. Deploy security rules (จำกัดสิทธิ์ให้แต่ละคนเห็นแค่ข้อมูลตัวเอง):
   ```
   npm install -g firebase-tools
   firebase login
   firebase init firestore   # เลือกโปรเจกต์ที่สร้างไว้, ใช้ไฟล์ firestore.rules ที่มีอยู่แล้ว
   firebase deploy --only firestore:rules
   ```

Firebase Spark plan (ฟรี) ให้ Firestore 1GB storage + 50,000 reads/20,000 writes ต่อวัน และ Auth ไม่จำกัดผู้ใช้ — เพียงพอสำหรับเริ่มต้นใช้งานจริงแบบฟรี

## 2. รันทดสอบในเครื่องก่อน deploy

```
cd web
npm run dev
```
เปิด http://localhost:3000 → สมัครสมาชิก → ลองเพิ่มข้อมูล

## 3. Deploy ขึ้น Vercel (ฟรี)

**วิธีง่ายที่สุด (ไม่ต้องใช้ GitHub):**
```
cd web
npx vercel
```
ทำตามขั้นตอน login (เปิดเบราว์เซอร์ให้ยืนยันบัญชี Vercel ฟรี) แล้วตอบคำถามตามค่า default ได้เลย

**จากนั้นต้องเพิ่ม environment variables ใน Vercel:**
```
npx vercel env add NEXT_PUBLIC_FIREBASE_API_KEY
npx vercel env add NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
npx vercel env add NEXT_PUBLIC_FIREBASE_PROJECT_ID
npx vercel env add NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
npx vercel env add NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
npx vercel env add NEXT_PUBLIC_FIREBASE_APP_ID
```
(ใส่ค่าจาก `.env.local` ทีละตัว เลือก Production + Preview + Development ทั้งหมด)

แล้ว deploy จริงอีกครั้ง:
```
npx vercel --prod
```

จะได้ URL จริงที่ใช้งานได้ทันที เช่น `https://portfolio-app-xxxx.vercel.app`

**หรือใช้ GitHub (แนะนำถ้าต้องการ auto-deploy ทุกครั้งที่ push):**
1. Push โค้ด `web/` ขึ้น GitHub repo
2. ไปที่ https://vercel.com/new → Import repo → ใส่ environment variables ในหน้า Settings ก่อนกด Deploy
