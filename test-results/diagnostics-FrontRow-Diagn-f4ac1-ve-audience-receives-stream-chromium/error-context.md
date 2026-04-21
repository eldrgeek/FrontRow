# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: diagnostics.spec.ts >> FrontRow Diagnostics >> full show flow: performer goes live, audience receives stream
- Location: tests/diagnostics.spec.ts:112:7

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - button "📹" [ref=e7] [cursor=pointer]
    - generic:
      - button "⬆️"
      - button "🔍+"
      - button "📍"
      - button "⬅️"
      - button "🎯"
      - button "⬇️"
      - button "➡️"
      - button "🔍-"
    - generic [ref=e8]:
      - generic [ref=e9]:
        - generic [ref=e10]: "✅ Socket: f_ju0OUJ6cUAB369AAAF"
        - generic [ref=e11]: "Show: idle"
        - generic [ref=e12]: "Role: PERFORMER"
        - generic [ref=e13]: "❌ Seat: none"
        - generic [ref=e14]: ❌ PerformerStream
        - generic [ref=e15]: ❌ UserStream
        - generic [ref=e16]: "Backend: https://vpsmikewolf.duckdns.org:4001"
        - generic [ref=e17]: "LiveKit: wss://vpsmikewolf.duckdns.org"
      - generic [ref=e18]: "Backend unreachable: SyntaxError: Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"
      - generic [ref=e19]: "Backend unreachable: TypeError: Failed to fetch"
      - generic [ref=e20]: "Backend unreachable: TypeError: Failed to fetch"
      - generic [ref=e21]: "Backend unreachable: TypeError: Failed to fetch"
      - generic [ref=e22]: "Backend unreachable: SyntaxError: Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"
      - generic [ref=e23]: "Backend unreachable: SyntaxError: Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"
      - generic [ref=e24]: "Backend unreachable: SyntaxError: Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"
      - generic [ref=e25]: "Backend unreachable: SyntaxError: Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"
      - generic [ref=e26]: "Backend unreachable: SyntaxError: Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"
      - generic [ref=e27]: "Backend unreachable: SyntaxError: Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"
  - generic:
    - generic:
      - generic [ref=e29] [cursor=pointer]:
        - generic [ref=e30]: 🎤
        - generic [ref=e31]: "Artist Mode: Performer"
      - button "GO LIVE NOW" [ref=e33] [cursor=pointer]
```