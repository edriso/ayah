# BotFather setup

Ready-to-paste text for setting up @AyahHifzBot in @BotFather (the
`/mybots` -> Edit Bot menu). The bot UI is Arabic, so the public texts are
Arabic too. Copy each block as-is.

Note: the bot already sets its command list, its **About** (short
description) and its **Description** automatically on every start (via
`setMyCommands`, `setMyShortDescription` and `setMyDescription` in
`setBotProfile` in `src/bot.ts`; the About/Description text lives in
`COPY.botAbout` / `COPY.botDescription` in `src/lib/copy.ts`). You only need
to paste any of this into BotFather if you also want it set there by hand, or
if the bot is not running yet. Keep the two copies in sync if you change
either. The **Name**, profile photo, and description picture cannot be set via
the Bot API, so those still go in BotFather by hand (see below).

---

## Name

آية

## About

(BotFather "Edit About", max ~120 characters. Shown on the bot's profile.)

احفظ القرآن آيةً آية 🌿 تصلك آية كل يوم مع آيات للمراجعة، في الوقت والأيام التي تختارها. اضغط Start للبدء.

## Description

(BotFather "Edit Description", max ~512 characters. Shown on the empty-chat
start screen, before the user presses Start.)

السلام عليكم ورحمة الله 🌿
بوت "آية" يعينك على حفظ القرآن الكريم بخطوات صغيرة ثابتة:
• تصلك كل يوم آية جديدة للحفظ، ومعها آيات سابقة من نفس السورة للمراجعة.
• تختار السورة التي تبدأ بها، والترتيب: من الناس (منهج الحفظ) أو من الفاتحة (ترتيب المصحف).
• تختار وقت الإرسال والأيام التي تناسبك.
• يمكنك أخذ راحة وقتما تشاء، وتعود من حيث توقفت.
اضغط Start للبدء بإذن الله.

---

## Commands

When BotFather says "Send me a list of commands", paste exactly this block
(no leading slashes, one command per line, `command - description`):

today - عرض آية اليوم
surah - اختيار سورة البداية
order - اختيار الترتيب (المصحف أو الحفظ)
time - ضبط وقت الإرسال
days - اختيار أيام الإرسال
review - عدد آيات المراجعة
timezone - ضبط المنطقة الزمنية
pause - أخذ راحة أو العودة منها
settings - عرض إعداداتك
help - المساعدة

---

## Other settings

- Description picture / Botpic: optional, set your own image in BotFather.
- Privacy Policy: optional. The bot stores only what it needs to deliver
  ayat (your Telegram id, timezone, send time, chosen days, review count,
  and a per-day delivery record). If you want to publish a policy, host a
  short page saying that and set its URL in BotFather. It is not required.
- Group privacy: this is a one-to-one bot, so you can leave group privacy
  ON (the default).
