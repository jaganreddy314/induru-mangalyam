import type { SVGProps } from 'react';
import {
  Activity, ArrowLeft, Bell, Bookmark, BookmarkCheck, Calendar, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight,
  Circle, CircleAlert, CircleCheck, CircleDot, CirclePause, CircleUser, Clipboard, Clock, Coffee, Compass, Contact, Ellipsis,
  Eye, EyeOff, FileCheck2, FileLock2, FileText, Filter, Flag, Globe, Handshake, Heart, House, Image, Inbox, Info, KeyRound,
  LayoutDashboard, LifeBuoy, Link2, Lock, LockOpen, LogOut, Mail, MapPin, MessageSquare, Pencil, Phone, Plus, RotateCw,
  ScrollText, Search, Settings, Shield, ShieldCheck, SlidersHorizontal, Smartphone, Sparkles, Star, StickyNote, Timer,
  TriangleAlert, Upload, User, UserCheck, UserPlus, Users, X, ZoomIn, type LucideIcon,
} from 'lucide-react';

// Lucide icons (design handoff: 1.5–2px stroke, 15–22px), plus the brand status marks.
const lucide = {
  home: House, search: Search, heart: Heart, handshake: Handshake, users: Users, user: User, bell: Bell,
  shield: Shield, shieldCheck: ShieldCheck, check: Check, checkCheck: CheckCheck, x: X,
  chevronRight: ChevronRight, chevronLeft: ChevronLeft, chevronDown: ChevronDown, arrowLeft: ArrowLeft,
  filter: Filter, sliders: SlidersHorizontal, star: Star, lock: Lock, lockOpen: LockOpen, eye: Eye, eyeOff: EyeOff,
  info: Info, alert: TriangleAlert, circleAlert: CircleAlert, plus: Plus, calendar: Calendar, phone: Phone,
  smartphone: Smartphone, mail: Mail, settings: Settings, flag: Flag, pause: CirclePause, file: FileText,
  fileCheck: FileCheck2, fileLock: FileLock2, upload: Upload, globe: Globe, logout: LogOut, sparkle: Sparkles,
  clipboard: Clipboard, activity: Activity, key: KeyRound, compass: Compass, inbox: Inbox, clock: Clock,
  bookmark: Bookmark, bookmarkCheck: BookmarkCheck, link: Link2, message: MessageSquare, coffee: Coffee,
  mapPin: MapPin, pencil: Pencil, userCheck: UserCheck, userPlus: UserPlus, circleUser: CircleUser,
  circle: Circle, circleDot: CircleDot, circleCheck: CircleCheck, lifeBuoy: LifeBuoy, dashboard: LayoutDashboard,
  contact: Contact, scroll: ScrollText, timer: Timer, zoomIn: ZoomIn, rotate: RotateCw, note: StickyNote,
  more: Ellipsis, image: Image,
} satisfies Record<string, LucideIcon>;

// Brand status icons (assets/icons/*.svg) — not in Lucide.
const brandPaths = {
  verifiedFamily: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM15 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM7 17c.5-1.5 1.2-2 2-2s1.5.5 2 2M13 17c.5-1.5 1.2-2 2-2s1.5.5 2 2',
  candidateApproved: 'M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM3 21v-1a5 5 0 0 1 5-5h4M15 18l2 2 4-4',
  contactPrivate: 'M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM10 13h4v4h-4zM10.5 13v-1.5a1.5 1.5 0 0 1 3 0V13',
  brokerAssisted: 'M7 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20v-1a5 5 0 0 1 5-5M22 20v-1a5 5 0 0 0-5-5M9 17h6M12 14v6',
  turmericLeaf: 'M12 21C6 17 5 9 12 3c7 6 6 14 0 18zM12 20V7',
} as const;

export type IconName = keyof typeof lucide | keyof typeof brandPaths;

export function Icon({ name, size = 22, strokeWidth = 1.75, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  if (name in brandPaths) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
        <path d={brandPaths[name as keyof typeof brandPaths]} />
      </svg>
    );
  }
  const L = lucide[name as keyof typeof lucide];
  return <L size={size} strokeWidth={Number(strokeWidth)} aria-hidden="true" focusable="false" {...(rest as object)} />;
}

/** Gold line mark: turmeric leaf over two interlocked rings (placeholder until brand/mark-only.svg is final). */
export function Mark({ size = 64, stroke = '#C99A42', width = 1.6, stem = true }: { size?: number; stroke?: string; width?: number; stem?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={stroke} strokeWidth={width} aria-hidden="true" focusable="false">
      <path d="M32 5c6.5 6 6.5 15 0 21c-6.5-6-6.5-15 0-21z" />
      {stem ? <path d="M32 9v15" /> : null}
      <circle cx="25" cy="41" r="12" />
      <circle cx="39" cy="41" r="12" />
    </svg>
  );
}
