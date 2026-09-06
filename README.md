# 🌾 AnaajSetu — Farm-to-Buyer Marketplace

> **Connecting farmers directly with buyers, cutting out middlemen and bringing transparency to local food supply chains.**

AnaajSetu (meaning *"grain bridge"* in Hindi) is a mobile-first web marketplace built to solve the fragmented, middleman-heavy agricultural supply chain in India. Farmers can list their produce and receive fair prices; buyers can discover fresh, hyperlocal produce, negotiate deals, and track orders — all in one place.

---

## 📋 Table of Contents

1. [Problem Statement & Solution](#-problem-statement--solution)
2. [Key Features](#-key-features)
3. [How the Core Flows Work](#-how-the-core-flows-work)
4. [Technology Stack](#-technology-stack)
5. [System & Data Flow](#-system--data-flow)
6. [Project Structure](#-project-structure)
7. [Prerequisites](#-prerequisites)
8. [Local Setup & Installation](#-local-setup--installation)
9. [Environment Variables](#-environment-variables)
10. [Database Overview](#-database-overview)
11. [Authentication & Security](#-authentication--security)
12. [Deployment](#-deployment)
13. [Future Enhancements](#-future-enhancements)
14. [Team / Contributors](#-team--contributors)
15. [License](#-license)

---

## 🔍 Problem Statement & Solution

**Problem:**
Indian farmers, especially small and marginal ones, are heavily dependent on intermediaries (middlemen/aggregators) to sell their produce. This results in:
- Farmers receiving only a fraction of the final sale price.
- Buyers (restaurants, retailers, households) paying inflated prices with no insight into origin.
- Produce going to waste because there is no efficient local discovery mechanism.

**Solution — AnaajSetu:**
A dual-sided, role-based marketplace where:
- **Farmers** list available produce with quantity, price, quality grading, availability window, and photos.
- **Buyers** browse hyperlocal listings, send purchase requests, initiate price negotiations, and complete orders — all directly with the farmer.
- **Live Mandi price reference** (via India's `data.gov.in` Open Government Data API) gives both sides fair-price visibility, reducing information asymmetry.

---

## ✅ Key Features

### 👨‍🌾 For Farmers (Sellers)

| Feature | Description |
|---|---|
| **Produce Listings** | Create, edit, pause, or delete listings with images, category, quality grade, quantity, unit (kg/quintal/ton), price, availability dates, and minimum order quantity |
| **Image Uploads** | Multi-image upload per listing with browser-side compression; stored on Firebase Storage |
| **Mandi Price Reference** | Live widget on the listing form that fetches government mandi rates and compares them with the farmer's entered price |
| **Request Management** | View and act on pending buyer purchase requests; accept or reject atomically |
| **Negotiations** | Receive, review, and counter buyer price negotiations with a full offer history thread |
| **Order Management** | View accepted orders; complete delivery confirmation with OTP verification |
| **Dashboard Analytics** | Total sales, completed orders, top-selling produce, pending demand, active negotiations |
| **Reputation View** | Average rating and review count aggregated from verified buyer feedback |
| **Profile** | Farm name, location (state / district / locality), contact details |

### 🛒 For Buyers

| Feature | Description |
|---|---|
| **Marketplace Browse** | Browse active listings filtered and sorted by produce, location, and category |
| **Cart** | Add multiple listings from different farmers; real-time stock and price validation via Supabase Realtime |
| **Cart Checkout** | Atomic `checkout_cart` RPC converts cart items to pending requests grouped under an `order_group` |
| **Purchase Requests** | Send individual purchase requests with quantity and offered price; track status |
| **Negotiations** | Initiate price negotiations; exchange counter-offers with farmers in a threaded view |
| **Orders** | View active and completed orders; generate a 6-digit OTP to hand to the farmer for delivery confirmation |
| **Verified Reviews** | Leave 1–5 star ratings and text reviews exclusively on completed orders |
| **Dashboard Analytics** | Total spend, active orders, pending requests, active negotiations, top purchased produce |
| **Profile** | Buyer type (restaurant, café, local shop, hostel/canteen, food processor, retailer, NGO/food bank, household), business name, location |

---

## ⚙️ How the Core Flows Work

### 1. User Registration & Onboarding

1. User registers with **email + password** (or Google Sign-In) — handled by **Firebase Authentication**.
2. A matching row is inserted into the Supabase `profiles` table using the Firebase UID as the primary key.
3. First-time users are routed to a **2-step onboarding** wizard where they:
   - Select role: **Farmer** or **Buyer** (permanent, cannot be changed later).
   - Fill in name, phone, state, district, and locality.
   - Farmers optionally provide a farm name (inserted into `farmer_profiles`).
   - Buyers select their buyer type and optionally a business name (inserted into `buyer_profiles`).
4. On completion, users are redirected to their role-specific dashboard.

### 2. Marketplace & Listings

- Farmers publish produce listings with full details and optional images.
- The listing form integrates a **Mandi Reference widget** that queries the `/mandi-prices` Netlify function in real time (debounced at 500 ms). The function:
  1. Queries the `data.gov.in` AGMARKNET Open Government Data API for live Mandi prices.
  2. Falls back to a deterministic local reference dataset (for 30+ produce types) if the government API is unavailable.
  3. Displays min/max/modal price per kg, an estimated batch value, and a price comparison badge relative to the farmer's entered price.
- Buyers browse the marketplace and can add listings to their **cart** or send a direct **purchase request**.

### 3. Cart → Checkout → Farmer Approval

1. Buyer adds listings to cart (`buyer_carts` / `cart_items`; real-time sync via Supabase Realtime).
2. On checkout, the `checkout_cart(buyer_id)` PostgreSQL RPC runs atomically:
   - Validates listing availability and stock.
   - Creates **pending** `requests` (not orders) grouped by `order_group_id`.
   - Clears the cart.
3. Farmers see the pending cart requests in their **Requests** view and can **Accept** (via `accept_reservation` RPC) or reject.
4. Accepting a request atomically: decrements listing stock, marks the request `accepted`, and inserts an `orders` row.

### 4. Purchase Requests (Direct)

- Buyers can send direct requests from a listing view, specifying quantity and an offered price.
- Farmers accept or reject directly from their Requests dashboard.

### 5. Negotiations (Smart Bargaining)

- Either side can initiate a negotiation on a listing.
- Offers are stored in `negotiation_offers` with sequential `offer_number` and `offer_type` (`initial` / `counter`).
- Both farmer and buyer can view the full offer thread and counter, accept, or reject.
- On acceptance, the negotiation stores the `final_price_per_unit` and `final_quantity`.

### 6. Order Completion via OTP

1. Once a farmer accepts an order, a **6-digit OTP** is generated server-side (`generate_order_otp` RPC).
2. The raw OTP is stored in the `order_secrets` table (no anon RLS — only accessible via `SECURITY DEFINER` RPCs).
3. The OTP hash (bcrypt) is stored on the `orders` row.
4. On delivery, the **buyer** retrieves their OTP via `get_buyer_otp` and shows it to the farmer.
5. The **farmer** enters the OTP in the app; `verify_order_otp` RPC verifies the bcrypt hash and atomically marks the order `completed`.

### 7. Verified Reviews

- After an order is marked `completed`, buyers can submit a rating (1–5 stars) and optional text review.
- Review submission is gated by the `/submit-review` Netlify function, which:
  1. Verifies the buyer's **Firebase ID token** with the Firebase Identity Toolkit REST API.
  2. Confirms the order exists, is `completed`, and belongs to the submitting buyer.
  3. Upserts the review in `farmer_reviews` using the Supabase Service Role key (bypasses client-side RLS).
- Farmer reputation (average rating, review count, completed order count) is aggregated in the `farmer_reputation_view` database view.

---

## 🛠 Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, React Router v6, Vite 5 |
| **UI / Icons** | Vanilla CSS (custom design system), Lucide React |
| **Authentication** | Firebase Authentication (Email/Password + Google OAuth) |
| **Database** | Supabase (PostgreSQL) |
| **File Storage** | Firebase Storage |
| **Realtime** | Supabase Realtime (Postgres CDC for cart & negotiations) |
| **Serverless Functions** | Netlify Functions (Node.js) |
| **Image Compression** | `browser-image-compression` |
| **External API** | data.gov.in AGMARKNET Open Government Data (Mandi prices) |
| **Hosting / Deployment** | Netlify |
| **Build Tool** | Vite |

---

## 🔄 System & Data Flow

```
User (Browser)
    │
    ├── Firebase Auth ──────────► Google / Email Login
    │        │
    │        └── UID ──────────► Supabase `profiles` table
    │
    ├── React App (Vite SPA)
    │        │
    │        ├── Supabase JS SDK ─────► PostgreSQL (Supabase)
    │        │       ├── profiles / farmer_profiles / buyer_profiles
    │        │       ├── listings / listing_images
    │        │       ├── requests / orders / order_groups
    │        │       ├── negotiations / negotiation_offers
    │        │       ├── buyer_carts / cart_items
    │        │       ├── farmer_reviews / order_secrets
    │        │       └── (Realtime CDC on cart_items, negotiations)
    │        │
    │        └── Firebase Storage SDK ─► Listing image uploads
    │
    └── Netlify Functions (Serverless)
             ├── /mandi-prices ──────► data.gov.in AGMARKNET API
             │                          └── (local fallback reference data)
             └── /submit-review ─────► Firebase Identity Toolkit (token verify)
                                       └── Supabase REST API (service role key)
```

---

## 📁 Project Structure

```
AnaajSetu/
├── database/                        # All Supabase SQL migration files
│   ├── AnaajSetu_Core_Profile_Repair.sql
│   ├── AnaajSetu_Phase_3_Listings.sql
│   ├── AnaajSetu_Phase_3_1_Listing_Enhancements.sql
│   ├── AnaajSetu_Phase_4_Buyer_Requests.sql
│   ├── AnaajSetu_Phase_5_Phone_Contacts.sql
│   ├── AnaajSetu_Phase_6_Atomic_Reservations.sql
│   ├── AnaajSetu_Smart_Bargaining.sql
│   ├── AnaajSetu_Smart_Bargaining_Fix.sql
│   ├── AnaajSetu_Cart_System.sql
│   ├── AnaajSetu_Cart_Farmer_Approval_Fix.sql
│   ├── AnaajSetu_Order_History.sql
│   ├── AnaajSetu_Order_History_Relationship_Fix.sql
│   ├── AnaajSetu_Order_OTP_Completion.sql
│   ├── AnaajSetu_Farmer_Feedback.sql
│   ├── AnaajSetu_Farmer_Feedback_RLS_Fix.sql
│   ├── AnaajSetu_Listing_Deletion_Fix.sql
│   ├── AnaajSetu_Listing_Deletion_RPC.sql
│   ├── AnaajSetu_Listing_Storage_Fix.sql
│   └── Fix_Accept_Reservation_RPC.sql
│
├── netlify/
│   └── functions/
│       ├── mandi-prices.js          # Serverless: live mandi price proxy + fallback
│       └── submit-review.js         # Serverless: Firebase-verified review submission
│
├── src/
│   ├── components/
│   │   ├── buyer/
│   │   │   ├── BuyerBottomNav.jsx
│   │   │   ├── BuyerHeaderTop.jsx
│   │   │   └── BuyerLayout.jsx
│   │   ├── common/
│   │   │   ├── EmptyState.jsx
│   │   │   ├── FormErrorSummary.jsx
│   │   │   ├── LoadingState.jsx
│   │   │   └── StatusBadge.jsx
│   │   └── seller/
│   │       ├── MandiReference.jsx   # Live mandi price widget for listing form
│   │       └── SellerBottomNav.jsx
│   │
│   ├── data/
│   │   └── mandiReference.js        # Local fallback reference price data
│   │
│   ├── hooks/
│   │   ├── useAuth.jsx              # Firebase Auth + Supabase profile context
│   │   ├── useCart.jsx              # Cart state + Supabase Realtime sync
│   │   ├── useConfirm.jsx           # Global confirm dialog context
│   │   └── useToast.jsx             # Global toast notification context
│   │
│   ├── lib/
│   │   ├── firebase.js              # Firebase app, auth, and storage init
│   │   └── supabase.js              # Supabase client init
│   │
│   ├── pages/
│   │   ├── auth/
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   └── Onboarding.jsx       # 2-step role selection & profile setup
│   │   ├── buyer/
│   │   │   ├── BuyerDashboard.jsx
│   │   │   ├── BuyerCart.jsx
│   │   │   ├── BuyerRequests.jsx
│   │   │   ├── BuyerNegotiations.jsx
│   │   │   ├── BuyerOrders.jsx
│   │   │   └── BuyerProfile.jsx
│   │   └── seller/
│   │       ├── SellerDashboard.jsx
│   │       ├── ListingForm.jsx      # Create/edit listing with mandi reference
│   │       ├── SellerRequests.jsx
│   │       ├── SellerNegotiations.jsx
│   │       ├── SellerOrders.jsx
│   │       └── SellerProfile.jsx
│   │
│   ├── services/
│   │   ├── buyerService.js          # Buyer dashboard analytics queries
│   │   └── sellerService.js         # Farmer listings, requests, analytics queries
│   │
│   ├── utils/
│   │   ├── locationData.js          # India state/district data loader
│   │   └── userMessages.js          # Shared UI message strings
│   │
│   ├── App.jsx                      # Router, providers, protected routes
│   ├── main.jsx                     # React entry point
│   └── index.css                    # Global CSS design system
│
├── public/                          # Static public assets
├── assets/                          # Project assets
├── index.html                       # HTML entry point
├── vite.config.js                   # Vite build configuration
├── netlify.toml                     # Netlify build + SPA redirect config
└── package.json
```

---

## 🔧 Prerequisites

Before setting up the project, ensure you have:

- **Node.js** ≥ 18.x and **npm** ≥ 9.x
- A **Firebase** project with:
  - Authentication enabled (Email/Password and optionally Google)
  - Firebase Storage enabled
- A **Supabase** project with:
  - A PostgreSQL database (all schema migrations applied from the `database/` folder)
  - Supabase Realtime enabled for `cart_items`, `negotiations`, and `negotiation_offers`
- A **Netlify** account (for deployment and serverless functions)
- An API key from **data.gov.in** for the AGMARKNET Mandi Price resource *(optional — local fallback data is used when absent)*

---

## 🚀 Local Setup & Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/AnaajSetu.git
   cd AnaajSetu
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**

   Create a `.env` file in the project root (see [Environment Variables](#-environment-variables) below).

4. **Apply database migrations**

   Open your Supabase project → SQL Editor and run each file in the `database/` folder in the following order:

   1. `AnaajSetu_Core_Profile_Repair.sql`
   2. `AnaajSetu_Phase_3_Listings.sql`
   3. `AnaajSetu_Phase_3_1_Listing_Enhancements.sql`
   4. `AnaajSetu_Phase_4_Buyer_Requests.sql`
   5. `AnaajSetu_Phase_5_Phone_Contacts.sql`
   6. `AnaajSetu_Phase_6_Atomic_Reservations.sql`
   7. `AnaajSetu_Smart_Bargaining.sql`
   8. `AnaajSetu_Smart_Bargaining_Fix.sql`
   9. `AnaajSetu_Order_History.sql`
   10. `AnaajSetu_Order_History_Relationship_Fix.sql`
   11. `AnaajSetu_Cart_System.sql`
   12. `AnaajSetu_Cart_Farmer_Approval_Fix.sql`
   13. `AnaajSetu_Order_OTP_Completion.sql`
   14. `AnaajSetu_Farmer_Feedback.sql`
   15. `AnaajSetu_Farmer_Feedback_RLS_Fix.sql`
   16. `AnaajSetu_Listing_Deletion_Fix.sql`
   17. `AnaajSetu_Listing_Deletion_RPC.sql`
   18. `AnaajSetu_Listing_Storage_Fix.sql`
   19. `Fix_Accept_Reservation_RPC.sql`

5. **Configure Firebase**

   In your Firebase console, add your development domain (e.g. `localhost`) to the **Authorized domains** list for Authentication.

6. **Run the development server**
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:5173` by default.

7. **Run Netlify Functions locally** *(optional — required for Mandi prices and review submission)*
   ```bash
   npm install -g netlify-cli
   netlify dev
   ```
   This starts the full stack at `http://localhost:8888` and makes Netlify Functions available at `/.netlify/functions/*`.

---

## 🔑 Environment Variables

Create a `.env` file at the project root with the following variable **names**. Replace each placeholder with your actual values. **Never commit real secret values to version control.**

```env
# ── Firebase (client-side) ──────────────────────────────────────
VITE_FIREBASE_API_KEY=YOUR_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=YOUR_PROJECT.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID=YOUR_FIREBASE_APP_ID

# ── Supabase (client-side anon key) ─────────────────────────────
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

For **Netlify Functions**, set these in the Netlify dashboard under **Site Settings → Environment Variables**:

```env
# ── Government Open Data API ─────────────────────────────────────
DATA_GOV_API_KEY=YOUR_DATA_GOV_IN_API_KEY

# ── Firebase (server-side, for token verification) ───────────────
FIREBASE_API_KEY=YOUR_FIREBASE_API_KEY

# ── Supabase (server-side service role — never expose to client) ──
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

> ⚠️ **Important:** `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security. It must **only** be used in server-side Netlify Functions and must **never** be included in the client bundle or committed to source control.

---

## 🗄 Database Overview

All data is stored in a **Supabase PostgreSQL** database. The schema is fully managed via the SQL migration files in the `database/` directory.

### Core Tables

| Table | Purpose |
|---|---|
| `profiles` | Common user record: Firebase UID as PK, `full_name`, `phone_number`, `role` (`farmer`/`buyer`), `state`, `district`, `locality` |
| `farmer_profiles` | Farmer-specific data: `farm_name`, linked to `profiles` by Firebase UID |
| `buyer_profiles` | Buyer-specific data: `buyer_type`, `business_name`, linked to `profiles` |
| `listings` | Produce listings: name, category, quantity, unit, price, quality, availability dates, minimum order quantity, location, status (`active`/`paused`/`sold_out`) |
| `listing_images` | Uploaded listing images: `image_url`, Firebase `storage_path`, `sort_order` |
| `requests` | Buyer purchase requests: requested quantity, offered price, status (`pending`/`accepted`/`rejected`/`cancelled`/`completed`) |
| `negotiations` | Price negotiation sessions: `status`, `final_price_per_unit`, `final_quantity` |
| `negotiation_offers` | Individual offers in a negotiation: `price_per_unit`, `quantity`, `offer_type` (`initial`/`counter`), `offer_number` |
| `buyer_carts` | One cart per buyer (unique on `buyer_id`) |
| `cart_items` | Items in a buyer's cart: price snapshot + live join for stock validation |
| `order_groups` | Groups all orders originating from a single cart checkout |
| `orders` | Persistent transaction records: price snapshot, status (`accepted`/`completed`/`cancelled`), OTP hash columns |
| `order_secrets` | Plain-text delivery OTPs — **no anon RLS policies**; accessible only through `SECURITY DEFINER` RPCs |
| `farmer_reviews` | Buyer reviews on completed orders: `rating` (1–5), optional `review_text` |

### Key Views & Database RPCs (Stored Procedures)

| Object | Type | Purpose |
|---|---|---|
| `farmer_reputation_view` | View | Aggregates average rating, review count, and completed order count per farmer |
| `checkout_cart(buyer_id)` | RPC | Atomic cart checkout → creates pending requests grouped by `order_group_id`, clears cart |
| `accept_reservation(request_id, farmer_id)` | RPC | Atomically accepts a request, decrements listing stock, creates an order |
| `delete_farmer_listing(listing_id, farmer_id)` | RPC | Hard-deletes listings without active transactions; soft-deletes (sets `deleted_at`) otherwise |
| `generate_order_otp(order_id, caller_id)` | RPC | Generates a 6-digit OTP, stores the bcrypt hash on the order, raw value in `order_secrets` |
| `get_buyer_otp(order_id, buyer_id)` | RPC | Returns the plain-text OTP to the verified buyer |
| `verify_order_otp(order_id, farmer_id, otp)` | RPC | Verifies bcrypt hash and atomically marks the order `completed` |

---

## 🔐 Authentication & Security

### Authentication Architecture

- **Firebase Authentication** is the primary identity provider (Email/Password + Google OAuth).
  - Session persistence is set to `browserLocalPersistence`.
  - The Firebase UID is used as the primary key across all Supabase tables.
- On login, the React `AuthProvider` listens to Firebase `onAuthStateChanged` and fetches the matching Supabase `profiles` row.
- **Protected routes** in `App.jsx` redirect unauthenticated users to `/login` and users without a role profile to `/onboarding`.
- Role-based access is enforced at the router level: farmer routes require `role === "farmer"`, buyer routes require `role === "buyer"`.

### Supabase Row Level Security (RLS)

> **Prototype Note:** Current RLS uses broad `anon` policies with client-side UID filtering for rapid development. For production, policies should be tightened using Firebase custom JWTs or a full migration to Supabase Auth.

- RLS is **enabled** on all tables.
- The `order_secrets` table has **no anon policies** — raw OTPs are never directly queryable from the client; all access is through `SECURITY DEFINER` functions.
- The `farmer_reviews` table includes production-grade policies restricting `INSERT` to authenticated buyers on their own completed orders.

### Serverless Security (Review Submission)

- The `/submit-review` Netlify Function validates the buyer's **Firebase ID token** server-side via the Firebase Identity Toolkit REST API before any data is written.
- It uses the **Supabase Service Role key** (never sent to the browser) to write the review, completely bypassing client-facing RLS.

---

## 🌐 Deployment

The project is configured for deployment on **Netlify**.

### Option A: Deploy via Netlify Dashboard

1. Connect your GitHub repository to Netlify.
2. Configure the build settings:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
   - **Functions directory:** `netlify/functions`
3. Add all required [environment variables](#-environment-variables) under **Site Settings → Environment Variables**.
4. Trigger a deploy. The `netlify.toml` redirect rule ensures SPA routing works correctly:

   ```toml
   [build]
     command   = "npm run build"
     publish   = "dist"
     functions = "netlify/functions"

   [[redirects]]
     from   = "/*"
     to     = "/index.html"
     status = 200
   ```

### Option B: Deploy via Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod
```

### Build Only (Manual)

```bash
npm run build
# Output is written to the dist/ directory
```

---

## 🚧 Future Enhancements

- [ ] **Supabase Auth Integration** — Replace prototype RLS with proper Supabase JWT or Firebase custom token authentication and tightened per-row policies.
- [ ] **Push Notifications** — Firebase Cloud Messaging (FCM) for real-time alerts on requests, orders, and negotiations.
- [ ] **Location-based Ranking** — Rank marketplace listings by distance from the buyer's registered location using PostGIS geospatial queries.
- [ ] **Phone Number Authentication** — OTP-based phone login for rural farmers with limited email access.
- [ ] **Multi-language Support** — Localisation for Hindi and regional languages (Marathi, Bengali, Tamil, Telugu, etc.).
- [ ] **Farmer Coordinator Role** — Restore the `coordinator` role to support FPO/SHG-level produce aggregation.
- [ ] **Logistics Integration** — Last-mile delivery tracking and logistics partner API integration.
- [ ] **In-app Payments** — UPI / Razorpay integration with escrow for buyer/seller protection.
- [ ] **Admin & Moderation Dashboard** — Tools for listing quality control and dispute resolution.
- [ ] **Progressive Web App (PWA)** — Offline support and home-screen installability for low-connectivity rural use.

---

## 👥 Team / Contributors

| Name | Role |
|---|---|
| *(Your Name)* | Full-Stack Development, UI/UX Design, Database Architecture |
| *(Team Member 2)* | *(Role)* |
| *(Team Member 3)* | *(Role)* |

> 📝 *Update this section with actual team member names and roles before final submission.*

---

## 📄 License

This project was built as a hackathon prototype. Licensing terms are to be decided after the event. All code in this repository is the original work of the team members listed above.

---

<div align="center">
  <strong>Built with ❤️ for India's farmers</strong><br/>
  <em>AnaajSetu — Bridging Farm to Fork</em>
</div>
