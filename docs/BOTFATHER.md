# BotFather setup

Ready-to-paste text for setting up @AyahHifzBot in @BotFather (the
`/mybots` -> Edit Bot menu). The bot UI is Arabic, so the public texts are
Arabic too. Copy each block as-is.

Note: the bot already sets its command list automatically on every start
(via `setMyCommands` in `apps/telegram/src/bot.ts`). You only need to paste
the commands into BotFather if you also want them set there by hand, or if
the bot is not running yet. Keep the two lists in sync if you change either.

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
• تختار وقت الإرسال والأيام التي تناسبك.
• يمكنك أخذ راحة وقتما تشاء، وتعود من حيث توقفت.
نبدأ من سورة الناس ونمضي إلى الفاتحة بإذن الله. اضغط Start للبدء.

---

## Commands

When BotFather says "Send me a list of commands", paste exactly this block
(no leading slashes, one command per line, `command - description`):

today - عرض آية اليوم
time - ضبط وقت الإرسال
days - اختيار أيام الإرسال
review - عدد آيات المراجعة
timezone - ضبط المنطقة الزمنية
break - أخذ راحة
resume - العودة من الراحة
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
