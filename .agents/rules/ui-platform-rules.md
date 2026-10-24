# UI Platform Selection and Design Rules

Whenever the user requests a **Windows UI, Windows view, mobile UI, or mobile view**, design the interface specifically for the platform mentioned.

## 1. Windows UI / Windows View
- Design the interface specifically for a Windows desktop application.
- Optimize the layout for large screens, keyboard and mouse interactions, desktop navigation, and efficient workflows.
- Use appropriate desktop components: sidebars, navigation panels, data tables, dialogs, status bars, and multi-panel layouts wherever suitable.
- Ensure the interface looks and behaves like a native/professional Windows desktop application, never a mobile app stretched across a large screen.

## 2. Mobile UI / Mobile View
- Design the interface specifically for mobile phones.
- Optimize the layout for small screens, touch interactions, vertical scrolling, and one-handed usability.
- Use responsive layouts, mobile-friendly navigation (bottom tabs, app bars), appropriately sized touch targets, and readable typography.
- Ensure all content fits the mobile screen naturally without horizontal overflow or unnecessary desktop-style elements.

## 3. Strict Platform Separation
- **Windows UI/View = Windows desktop experience only.**
- **Mobile UI/View = Mobile phone experience only.**
- Do not confuse, combine, or substitute one platform's design for the other.
- Do not automatically create both versions unless explicitly requested.

## 4. Responsive Design and Implementation
- If both Windows and mobile versions are requested, create two distinct, platform-optimized UI experiences while maintaining consistent branding, functionality, colors, and design language.
- Adapt the navigation, component hierarchy, spacing, interactions, and information density to suit each platform.

**Primary Rule:** Always interpret platform instructions literally. Build the UI for the exact platform requested, prioritize usability on that platform, and never deliver a mobile-style interface when asked for Windows or a desktop-style interface when asked for mobile.
