# UI.md — DropRoom Design System & Frontend Guidelines

**Project:** DropRoom  
**Version:** 1.1  
**Platform:** Web Application  
**Frontend:** React + TypeScript  
**Styling:** Tailwind CSS  
**Animation:** Motion for React  
**Icons:** Lucide React  
**State Management:** Zustand  
**Design Direction:** Modern iOS Liquid Glass / Glassmorphism

---

# 1. Design Philosophy

DropRoom menggunakan desain modern yang terinspirasi dari Apple iOS terbaru, khususnya Liquid Glass Design Language.

Karakteristik utama:

- Modern Glassmorphism.
- Clean & Minimalist.
- Compact Interface.
- Smooth Animations.
- Consistent Spacing.
- Subtle Shadows.
- Soft Gradients.
- Premium Visual Experience.
- Responsive Desktop & Mobile.

Tujuan desain adalah menghasilkan aplikasi yang terasa premium, ringan, elegan, dan nyaman digunakan.

**Avoid AI Generic UI.**

Jangan menggunakan pola template SaaS generik. Setiap elemen harus memiliki tujuan, proporsi, dan konsistensi visual.

Prioritaskan usability dibanding dekorasi.

# 2. Visual Identity

## 2.1 Color Palette

Gunakan warna dasar biru khas iOS dengan aksen mint green.

| Token | Color | Usage |
|---|---|---|
| Primary | #0A84FF | Primary button, link |
| Primary Dark | #0066CC | Hover, active |
| Accent | #30D5A0 | Success, realtime |
| Background | #F3F7FC | Main background |
| Surface | #FFFFFF | Content surface |
| Text Primary | #172033 | Main text |
| Text Secondary | #718096 | Secondary text |
| Border | #DCE6F2 | Subtle borders |
| Danger | #FF453A | Delete, error |
| Warning | #FF9F0A | Warning |

Dark mode juga harus didukung dengan kontras yang baik.

## 2.2 Background

Gunakan kombinasi:

- Soft blue gradient.
- Subtle mint glow.
- Translucent white surfaces.
- Ambient background blur.
- Subtle decorative light effects.

Background tidak boleh terlalu ramai atau mengganggu keterbacaan.

# 3. Glassmorphism System

Glass effect adalah identitas utama DropRoom.

## 3.1 Glass Surface

Karakteristik:

- Semi-transparent background.
- Backdrop blur.
- Thin translucent border.
- Soft shadow.
- Subtle highlight.
- Layered depth.

Contoh CSS:

```css
.glass-panel {
  background: rgba(255, 255, 255, 0.68);
  backdrop-filter: blur(24px) saturate(160%);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.75);
  box-shadow:
    0 8px 32px rgba(40, 90, 160, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.65);
}
```

## 3.2 Glass Variants

| Component | Intensity |
|---|---|
| Main Navigation | Medium |
| Floating Toolbar | Strong |
| Modal | Strong |
| Sidebar | Medium |
| Content Card | Light |
| Dropdown | Strong |
| Toast | Strong |
| Confirmation Dialog | Strong |

Jangan menerapkan glass effect secara berlebihan pada seluruh elemen.

Gunakan glass secara selektif untuk menciptakan hierarki visual.

# 4. Typography

Gunakan:

- Inter sebagai font utama.
- SF Pro Display sebagai alternatif jika tersedia.

| Element | Size |
|---|---:|
| Page Title | 24–28px |
| Section Title | 17–20px |
| Card Title | 14–16px |
| Body | 13–14px |
| Secondary | 12–13px |
| Caption | 11–12px |

Font weight:

- Regular: 400.
- Medium: 500.
- Semibold: 600.
- Bold: 700.

Hindari heading yang terlalu besar dan typography yang terlalu ramai.

# 5. Spacing & Layout System

Gunakan kelipatan 4px sebagai dasar spacing.

| Token | Value | Usage |
|---|---:|---|
| 1 | 4px | Icon gap |
| 2 | 8px | Small spacing |
| 3 | 12px | Component spacing |
| 4 | 16px | Standard padding |
| 5 | 20px | Section spacing |
| 6 | 24px | Card spacing |
| 8 | 32px | Large spacing |
| 10 | 40px | Section separation |
| 12 | 48px | Major layout gap |

## Padding Guidelines

| Component | Padding |
|---|---|
| Small Button | 8–12px |
| Input | 10–12px |
| Compact Card | 12–16px |
| Standard Card | 16–20px |
| Main Container | 20–24px |
| Modal | 20–24px |

Hindari padding terlalu besar dan ruang kosong yang tidak memiliki fungsi.

## Border Radius

| Component | Radius |
|---|---:|
| Small Button | 8px |
| Input | 9px |
| Card | 12px |
| Modal | 16px |
| Floating Panel | 18px |
| Main Workspace | 16px |
| Avatar | 50% |

Hindari radius berlebihan pada semua komponen.

# 6. Button & Input System

## Primary Button

- iOS Blue.
- Compact height.
- Subtle shadow.
- Smooth hover.
- Active press animation.

## Secondary Button

- Translucent glass.
- Thin border.
- Neutral background.

## Danger Button

- Red accent.
- Digunakan untuk tindakan destruktif.
- Selalu memiliki konfirmasi jika tindakan tidak dapat dibatalkan.

## Icon Button

- Compact square button.
- Lucide React icons.
- Hover background.
- Tooltip.
- Clear active state.

## Input

- Soft translucent surface.
- Height 38–42px.
- Clear focus ring.
- Smooth transition.
- Validation state.
- Consistent placeholder style.

# 7. Icon System — Lucide React

Gunakan **Lucide React sebagai satu-satunya icon library**.

Jangan mencampur:
- Font Awesome.
- Heroicons.
- Material Icons.
- Bootstrap Icons.
- Icon library lainnya.

Import icon sesuai kebutuhan:

```tsx
import {
  Upload,
  Download,
  Copy,
  File,
  FileText,
  Code,
  Folder,
  Clock,
  Users,
  Settings,
  Trash2,
  Link,
  Check,
  X,
  MoreHorizontal,
  Search,
  Plus,
  ChevronDown,
  CloudUpload,
  Wifi,
  WifiOff,
  CircleAlert
} from "lucide-react";
```

## Icon Standards

| Property | Standard |
|---|---|
| Default Size | 18px |
| Small | 14px |
| Medium | 20px |
| Large | 24px |
| Stroke Width | 1.8–2 |
| Style | Consistent outline |

Ketentuan:
- Icon harus memiliki makna yang jelas.
- Gunakan tooltip untuk icon button tanpa label.
- Jangan menggunakan emoji sebagai pengganti icon utama.
- Hindari icon berukuran terlalu besar.
- Gunakan icon yang sama untuk fungsi yang sama di seluruh aplikasi.

# 8. Motion & Animation System

Gunakan Motion for React untuk animasi komponen.

CSS Transition digunakan untuk interaksi sederhana.

## 8.1 Motion Principles

- Smooth.
- Natural.
- Subtle.
- Fast response.
- Tidak berlebihan.
- Tidak mengganggu aktivitas pengguna.

## 8.2 Animation Timing

| Interaction | Duration |
|---|---:|
| Button | 120–160ms |
| Hover | 150–180ms |
| Dropdown | 150–200ms |
| Toast | 200–250ms |
| Modal | 200–250ms |
| Page Transition | 180–280ms |
| Large Panel | 250–350ms |

## 8.3 Animation Behavior

### Page Transition
- Fade in.
- Subtle slide.
- Smooth exit.

### Modal
- Fade backdrop.
- Scale 0.96 to 1.
- Smooth appearance.

### Dropdown
- Fade.
- Translate Y.
- Subtle scale.

### Button
- Scale down when pressed.
- Smooth return.

### Card
- Subtle elevation.
- Soft hover background.

### Realtime
- Live indicator pulse.
- File new-item fade-in.
- Paste update highlight.
- Number transition.
- Upload progress animation.
- User presence transition.

## 8.4 Ambient Animation

Gunakan dekorasi subtle:

- Floating gradient glow.
- Slow background movement.
- Gentle glass reflection.
- Soft live indicator pulse.

Jangan menggunakan animasi terus-menerus yang mengganggu fokus.

## 8.5 Accessibility

Hormati `prefers-reduced-motion`.

Kurangi atau nonaktifkan animasi dekoratif ketika pengguna mengaktifkan pengaturan reduced motion.

# 9. Toast Notification System

DropRoom wajib memiliki sistem Toast Notification custom.

Jangan menggunakan browser alert, `window.alert()`, atau notification bawaan browser sebagai pengganti toast UI.

Toast harus memiliki desain iOS Glassmorphism.

## Toast Types

| Type | Color | Icon |
|---|---|---|
| Success | Mint Green | CheckCircle |
| Error | Red | CircleX |
| Warning | Orange | TriangleAlert |
| Info | Blue | Info |
| Loading | Blue | LoaderCircle |

## Toast Behavior

- Muncul dengan smooth animation.
- Auto dismiss.
- Manual close.
- Progress indicator opsional.
- Stack notification.
- Tidak menutupi tombol penting.
- Mendukung loading dan success state.
- Responsive desktop dan mobile.

## Toast Placement

Desktop:
- Top-right atau bottom-right.

Mobile:
- Top-center atau bottom-center.
- Memperhatikan safe area.
- Tidak menutupi bottom navigation.

## Toast Examples

```text
✓ File berhasil diupload
✓ Link berhasil disalin
✓ Paste berhasil disimpan
! Room akan berakhir dalam 5 menit
✕ Upload gagal, silakan coba lagi
⟳ Sedang mengupload file...
```

Gunakan satu global Toast Provider agar semua halaman memiliki sistem notifikasi yang konsisten.

# 10. Modal & Dialog System

Semua modal harus menggunakan komponen custom.

Jangan menggunakan `window.confirm()` atau `window.prompt()`.

## 10.1 Modal Design

Karakteristik:

- Glassmorphism.
- Backdrop blur.
- Soft shadow.
- Clean layout.
- Compact content.
- Consistent spacing.
- Smooth animation.
- Clear close button.

## 10.2 Modal Types

| Modal | Usage |
|---|---|
| Standard Modal | Form dan informasi |
| Confirmation Modal | Konfirmasi tindakan |
| Alert Modal | Peringatan |
| Preview Modal | File preview |
| Settings Modal | Pengaturan room |
| Share Modal | Copy room link |
| Upload Modal | Upload configuration |

## 10.3 Modal Behavior

- Center aligned pada desktop.
- Responsive pada mobile.
- Backdrop click dapat menutup modal jika aman.
- Escape key untuk menutup modal jika aman.
- Body scroll dikunci ketika modal aktif.
- Focus trap.
- Focus dikembalikan ke trigger ketika modal ditutup.
- Tidak boleh membuat modal bertumpuk tanpa kebutuhan.

## 10.4 Confirmation Popup

Confirmation popup wajib tersedia untuk tindakan penting.

Contoh:

**Delete File**

```text
+----------------------------------+
|                                  |
|          [Trash Icon]            |
|                                  |
|         Hapus File?              |
|                                  |
| File project-backup.zip akan     |
| dihapus dari room ini.           |
|                                  |
|  [Batal]          [Hapus File]   |
|                                  |
+----------------------------------+
```

**Leave Room**

```text
+----------------------------------+
|                                  |
|        [Log Out Icon]            |
|                                  |
|       Keluar dari Room?          |
|                                  |
| Kamu akan meninggalkan room ini. |
|                                  |
|  [Tetap di Sini]  [Keluar]       |
|                                  |
+----------------------------------+
```

### Confirmation Rules

Gunakan confirmation untuk:

- Delete File.
- Delete Paste.
- Leave Room.
- Menghapus seluruh data.
- Tindakan yang tidak dapat dibatalkan.

Tidak perlu confirmation untuk tindakan sederhana seperti copy link, membuka tab, atau melihat preview.

Tombol destructive harus menggunakan warna danger.

# 11. Dropdown, Popover & Tooltip

Gunakan komponen custom dengan desain yang konsisten.

## Dropdown

- Glass surface.
- Smooth open/close.
- Clear active state.
- Keyboard navigation.
- Outside click handling.

## Popover

- Compact floating panel.
- Soft shadow.
- Backdrop blur.
- Proper positioning.

## Tooltip

- Muncul pada hover desktop.
- Tidak menghalangi elemen utama.
- Delay singkat.
- Tidak wajib pada tombol yang sudah memiliki label jelas.

# 12. Loading, Skeleton & Empty State

Setiap halaman harus memiliki state:

- Loading.
- Success.
- Error.
- Empty.
- Offline.
- Reconnecting.

## Loading Skeleton

Gunakan skeleton yang menyerupai layout sebenarnya.

Hindari loading spinner besar yang memenuhi layar jika proses hanya membutuhkan waktu singkat.

## Empty State

Contoh:

```text
       [Folder Icon]

      Belum Ada File

Upload file pertama ke room ini
untuk mulai berbagi.

       [Upload File]
```

Gunakan icon sederhana, deskripsi singkat, dan tombol tindakan utama.

# 13. Desktop Layout

Desktop menggunakan struktur workspace compact.

```text
+------------------------------------------------------+
| Header / Room Information                            |
+------------------------------------------------------+
| Sidebar       | Main Workspace       | Room Panel    |
|               |                     |               |
| Files         | File List            | Room Info     |
| Paste         | Upload Area          | Online Users  |
| Activity      | Paste Editor         | Recent Paste  |
|               |                     |               |
+------------------------------------------------------+
```

## Header

- DropRoom Logo.
- Room Code.
- Copy Room Link.
- Live Status.
- Expiration Countdown.
- Online Users.
- Room Settings.
- Leave Room.

## Sidebar

- Files.
- Paste.
- Activity.
- Storage Indicator.

## Main Workspace

Menampilkan konten berdasarkan tab aktif.

Gunakan tabel compact untuk file pada desktop.

## Right Panel

- Room Information.
- Active Users.
- Recent Paste.
- Storage Information.

Right panel dapat disembunyikan pada layar yang lebih kecil.

# 14. Mobile Layout

Mobile bukan sekadar desktop yang diperkecil.

Gunakan struktur khusus mobile.

```text
+-----------------------------+
| DropRoom       Room Code    |
+-----------------------------+
| Live Status / Expiration    |
+-----------------------------+
|                             |
|       Main Content          |
|                             |
|       File List             |
|       Paste Editor          |
|       Activity              |
|                             |
+-----------------------------+
| Files | Paste | Activity    |
+-----------------------------+
```

## Mobile Guidelines

- Bottom Navigation.
- Compact Top Header.
- Full-width content.
- Card-based File List.
- Upload button mudah dijangkau.
- Paste Editor responsive.
- Modal menyesuaikan viewport.
- Tidak menggunakan desktop table.
- Toast tidak menutupi tombol utama.
- Gunakan safe-area inset.

## Responsive Breakpoints

| Device | Width |
|---|---|
| Mobile Small | 320–374px |
| Mobile | 375–767px |
| Tablet | 768–1023px |
| Desktop | 1024px+ |
| Wide Desktop | 1440px+ |

# 15. Component Design System

Semua komponen harus reusable.

## Layout Components

```text
AppLayout
├── AppHeader
├── DesktopSidebar
├── MobileNavigation
├── MainWorkspace
└── RoomInfoPanel
```

## Room Components

```text
RoomHeader
RoomCodeBadge
RoomStatus
RoomCountdown
RoomUserPresence
RoomSettings
RoomShareDialog
```

## File Components

```text
FileUploadZone
FileUploadButton
FileList
FileCard
FileTable
FilePreview
FileActions
UploadProgress
DownloadProgress
```

## Paste Components

```text
PasteEditor
PasteViewer
PasteToolbar
PasteLanguageSelector
PastePreview
PasteActions
```

## Feedback Components

```text
ToastProvider
ToastContainer
ToastItem
ModalProvider
Modal
ConfirmDialog
AlertDialog
Dropdown
Popover
Tooltip
LoadingSkeleton
EmptyState
ErrorState
```

## UI Components

```text
Button
IconButton
Input
Textarea
Select
Checkbox
Badge
Progress
Avatar
Separator
Tabs
Card
```

# 16. React Project Structure

Gunakan Feature-Based Architecture agar kode mudah dibaca, dipahami, dan dikembangkan.

```text
apps/
└── web/
    ├── public/
    │   ├── icons/
    │   └── images/
    │
    ├── src/
    │   ├── app/
    │   │   ├── App.tsx
    │   │   ├── router.tsx
    │   │   └── providers.tsx
    │   │
    │   ├── components/
    │   │   ├── ui/
    │   │   │   ├── Button.tsx
    │   │   │   ├── IconButton.tsx
    │   │   │   ├── Input.tsx
    │   │   │   ├── Modal.tsx
    │   │   │   ├── ConfirmDialog.tsx
    │   │   │   ├── AlertDialog.tsx
    │   │   │   ├── Dropdown.tsx
    │   │   │   ├── Popover.tsx
    │   │   │   ├── Tooltip.tsx
    │   │   │   ├── Toast.tsx
    │   │   │   ├── Progress.tsx
    │   │   │   └── Skeleton.tsx
    │   │   │
    │   │   └── layout/
    │   │       ├── AppHeader.tsx
    │   │       ├── Sidebar.tsx
    │   │       ├── MainLayout.tsx
    │   │       └── MobileNavigation.tsx
    │   │
    │   ├── features/
    │   │   ├── landing/
    │   │   ├── room/
    │   │   ├── files/
    │   │   ├── paste/
    │   │   └── activity/
    │   │
    │   ├── hooks/
    │   │   ├── useRoom.ts
    │   │   ├── useWebSocket.ts
    │   │   └── useUpload.ts
    │   │
    │   ├── services/
    │   │   ├── api.ts
    │   │   ├── websocket.ts
    │   │   └── file.service.ts
    │   │
    │   ├── stores/
    │   │   ├── room.store.ts
    │   │   ├── file.store.ts
    │   │   ├── paste.store.ts
    │   │   └── ui.store.ts
    │   │
    │   ├── styles/
    │   │   ├── globals.css
    │   │   ├── tokens.css
    │   │   ├── glass.css
    │   │   ├── animations.css
    │   │   └── themes.css
    │   │
    │   ├── types/
    │   │   ├── room.ts
    │   │   ├── file.ts
    │   │   ├── paste.ts
    │   │   └── ui.ts
    │   │
    │   └── utils/
    │       ├── format-size.ts
    │       ├── format-date.ts
    │       └── validators.ts
    │
    ├── package.json
    └── tsconfig.json
```

## Folder Responsibilities

| Folder | Responsibility |
|---|---|
| app | Application setup dan routing |
| components/ui | Reusable UI components |
| components/layout | Layout components |
| features | Feature-specific UI dan logic |
| hooks | Custom React hooks |
| services | API dan WebSocket |
| stores | Global state |
| styles | Design tokens dan styling |
| types | TypeScript definitions |
| utils | Helper functions |

Setiap feature dapat memiliki struktur internal:

```text
features/files/
├── components/
├── hooks/
├── services/
├── types/
└── index.ts
```

Jangan membuat satu file komponen terlalu besar.

Pisahkan UI, business logic, dan komunikasi API.

# 17. Code Quality Rules

- Gunakan TypeScript strict mode.
- Gunakan functional components.
- Gunakan reusable components.
- Hindari duplicate code.
- Hindari komponen monolitik.
- Pisahkan business logic dari UI.
- Gunakan semantic HTML.
- Gunakan design tokens.
- Gunakan consistent naming convention.
- Hindari penggunaan any.
- Gunakan lazy loading untuk fitur berat.
- Semua state loading, error, empty, dan success harus memiliki UI.
- Gunakan satu sistem Toast global.
- Gunakan satu sistem Modal global.
- Jangan membuat implementasi modal dan toast berbeda-beda di setiap halaman.

## Naming Convention

| Type | Convention | Example |
|---|---|---|
| Component | PascalCase | FileCard.tsx |
| Hook | camelCase | useRoom.ts |
| Service | camelCase | room.service.ts |
| Store | camelCase | room.store.ts |
| Utility | kebab-case | format-size.ts |
| Type | PascalCase | RoomInfo |

# 18. Performance Guidelines

- Hindari unnecessary re-render.
- Gunakan React.lazy untuk fitur besar.
- Lazy load Monaco Editor.
- Optimalkan file preview.
- Gunakan virtualized list jika diperlukan.
- Optimalkan image assets.
- Gunakan CSS transform dan opacity untuk animasi.
- Hindari animasi layout yang mahal.
- WebSocket harus memiliki reconnect strategy.
- Hormati prefers-reduced-motion.
- Gunakan dynamic import untuk komponen yang jarang digunakan.

# 19. UX Interaction Guidelines

Setiap interaksi harus memberikan feedback yang jelas.

| Action | Feedback |
|---|---|
| Create Room | Loading + success toast |
| Join Room | Validation + transition |
| Copy Link | Success toast |
| Upload File | Progress indicator |
| Download File | Progress indicator |
| Delete File | Confirmation dialog |
| Delete Paste | Confirmation dialog |
| Create Paste | Success toast |
| Update Paste | Saved indicator |
| Leave Room | Confirmation dialog |
| Room Expired | Expired screen |
| WebSocket Disconnect | Reconnecting indicator |

### Interaction Principles

- Tidak ada tombol tanpa fungsi.
- Setiap tombol memiliki hover dan active state.
- Setiap action memiliki feedback.
- Action destruktif membutuhkan konfirmasi.
- Gunakan toast untuk notifikasi singkat.
- Gunakan modal untuk interaksi yang membutuhkan fokus.
- Hindari modal untuk informasi sederhana.
- Jangan menggunakan browser alert dan confirm.

# 20. Final Design Principles

Seluruh implementasi UI DropRoom harus mengikuti prinsip berikut:

1. Premium iOS-inspired Glassmorphism.
2. Clean dan minimalist.
3. Compact dan tidak boros ruang.
4. Konsisten dalam spacing dan padding.
5. Typography mudah dibaca.
6. Animasi halus dan natural.
7. Custom Toast Notification.
8. Custom Modal dan Confirmation Popup.
9. Lucide React sebagai satu-satunya icon library.
10. Responsive desktop dan mobile.
11. Reusable component architecture.
12. Feature-based folder structure.
13. Tidak menggunakan AI Generic UI.
14. Fokus pada kecepatan dan kenyamanan.
15. Semua interaksi harus memiliki feedback yang jelas.

---

# FINAL GOAL

DropRoom harus terasa seperti aplikasi modern bergaya Apple iOS terbaru.

Visual harus bersih, ringan, elegan, memiliki efek Liquid Glass yang natural, dan animasi yang premium.

Semua komponen harus konsisten, mulai dari tombol, input, card, modal, toast, popup confirmation, dropdown, hingga navigasi.

Kode frontend harus modular, reusable, mudah dibaca, dan mudah dikembangkan.

**Prioritas utama: Premium UI + Compact Layout + Smooth Motion + Consistent Design System + Clean Code Architecture.**