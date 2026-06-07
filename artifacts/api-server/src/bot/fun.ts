import {
  EmbedBuilder,
  type Message,
  type TextChannel,
} from "discord.js";

const C = 0xff0000;

async function safeFetch(url: string, init?: RequestInit): Promise<unknown | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), ...init });
    if (!res.ok) return null;
    return await res.json() as unknown;
  } catch {
    return null;
  }
}

function decodeHtml(html: string): string {
  return html
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&apos;/g, "'")
    .replace(/%27/g, "'").replace(/%22/g, '"').replace(/%26/g, "&")
    .replace(/%3C/g, "<").replace(/%3E/g, ">").replace(/%20/g, " ");
}

const FACTS = [
  "A group of flamingos is called a flamboyance.",
  "Honey never spoils. Archaeologists have found 3,000-year-old honey in Egyptian tombs.",
  "Octopuses have three hearts and blue blood.",
  "A day on Venus is longer than a year on Venus.",
  "Bananas are slightly radioactive due to potassium-40.",
  "The shortest war in history lasted 38–45 minutes (Anglo-Zanzibar War, 1896).",
  "Crows can recognize human faces and hold grudges.",
  "The Eiffel Tower can be 15 cm taller in summer due to thermal expansion.",
  "There are more possible chess games than atoms in the observable universe.",
  "Wombats produce cube-shaped droppings — unique in the animal kingdom.",
  "A group of owls is called a parliament.",
  "Butterflies taste with their feet.",
  "Sharks are older than trees — they've existed for over 400 million years.",
  "The human body contains enough iron to make a nail about 3 inches long.",
  "Cleopatra lived closer in time to the Moon landing than to the construction of the Great Pyramid.",
  "A snail can sleep for 3 years at a stretch.",
  "Elephants are the only mammals that can't jump.",
  "The dot over the letter 'i' is called a tittle.",
  "Peanuts aren't technically nuts — they're legumes.",
  "The tongue of a blue whale weighs as much as an elephant.",
  "Lightning strikes the Earth about 100 times per second.",
  "Sea otters hold hands while sleeping so they don't drift apart.",
  "The unicorn is Scotland's national animal.",
  "It takes a photon around 8 minutes to travel from the Sun to Earth.",
  "Cats have been domesticated for about 10,000 years.",
];

const QUOTES = [
  { quote: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { quote: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
  { quote: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { quote: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
  { quote: "Success is not final, failure is not fatal: It is the courage to continue that counts.", author: "Winston Churchill" },
  { quote: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { quote: "Be the change that you wish to see in the world.", author: "Mahatma Gandhi" },
  { quote: "You only live once, but if you do it right, once is enough.", author: "Mae West" },
  { quote: "Life is what happens when you're busy making other plans.", author: "John Lennon" },
  { quote: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { quote: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { quote: "Whether you think you can or you think you can't, you're right.", author: "Henry Ford" },
  { quote: "I have not failed. I've just found 10,000 ways that won't work.", author: "Thomas Edison" },
  { quote: "Two roads diverged in a wood, and I took the one less traveled by.", author: "Robert Frost" },
  { quote: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
];

const ROASTS = [
  "You're not stupid — you just have bad luck thinking.",
  "I'd agree with you, but then we'd both be wrong.",
  "You have something on your chin... no, the third one down.",
  "I've seen better arguments in a fortune cookie.",
  "You're the reason the gene pool needs a lifeguard.",
  "If brains were dynamite, you wouldn't have enough to blow your hat off.",
  "You're proof that even evolution makes mistakes sometimes.",
  "You have the right to remain silent. Please use it.",
  "Your birth certificate is an apology letter from the maternity ward.",
  "You're not the dumbest person alive, but you better hope they don't die.",
];

const COMPLIMENTS = [
  "You light up every room you walk into! 🌟",
  "Your smile could melt the coldest of hearts! 😊",
  "You have a genuinely great sense of humor! 😂",
  "You make the world a better place just by being in it! 🌍",
  "Your kindness is truly one of a kind! 💖",
  "You are more talented than you give yourself credit for! 🎯",
  "Your positive attitude is absolutely contagious! ✨",
  "You inspire everyone around you without even realizing it! 🙌",
  "You have an amazing ability to make people feel welcome! 🤗",
  "The world is genuinely lucky to have you in it! 🍀",
];

const TOPICS = [
  "What's one thing you'd change about the internet?",
  "If you could have dinner with any historical figure, who would it be?",
  "What's your unpopular opinion about a popular movie?",
  "If you could live in any time period, when would it be?",
  "What's the most useless skill you have?",
  "If animals could talk, which would be the rudest?",
  "What's the weirdest food combination you actually enjoy?",
  "If you could instantly master one skill, what would it be?",
  "What would you do if you woke up invisible for a day?",
  "What's a technology you think will exist in 50 years?",
  "Would you rather explore the deep ocean or outer space?",
  "What's the best purchase you've ever made under $20?",
  "If you could speak every language fluently, what's the first thing you'd do?",
  "What show/movie are you embarrassed to admit you love?",
  "What would your autobiography be titled?",
];

const MORSE_CODE: Record<string, string> = {
  a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.", g: "--.",
  h: "....", i: "..", j: ".---", k: "-.-", l: ".-..", m: "--", n: "-.",
  o: "---", p: ".--.", q: "--.-", r: ".-.", s: "...", t: "-", u: "..-",
  v: "...-", w: ".--", x: "-..-", y: "-.--", z: "--..",
  "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
  "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
  " ": "/",
};

export async function handleJoke(message: Message): Promise<void> {
  const data = await safeFetch("https://official-joke-api.appspot.com/random_joke") as { setup?: string; punchline?: string } | null;
  if (!data?.setup) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Couldn't fetch a joke right now. Try again!")] });
    return;
  }
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle("😂 Random Joke")
        .addFields(
          { name: "Setup", value: data.setup, inline: false },
          { name: "Punchline", value: `||${data.punchline}||`, inline: false },
        )
        .setFooter({ text: "Click the spoiler to reveal the punchline!" }),
    ],
  });
}

export async function handleDadJoke(message: Message): Promise<void> {
  const data = await safeFetch("https://icanhazdadjoke.com/", {
    headers: { Accept: "application/json", "User-Agent": "DiscordBot" },
  }) as { joke?: string } | null;
  if (!data?.joke) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Couldn't fetch a dad joke. Try again!")] });
    return;
  }
  await message.reply({
    embeds: [new EmbedBuilder().setColor(C).setTitle("👨 Dad Joke").setDescription(`*${data.joke}*`)],
  });
}

export async function handleFact(message: Message): Promise<void> {
  const fact = FACTS[Math.floor(Math.random() * FACTS.length)]!;
  await message.reply({
    embeds: [new EmbedBuilder().setColor(C).setTitle("💡 Random Fact").setDescription(fact)],
  });
}

export async function handleQuote(message: Message): Promise<void> {
  const q = QUOTES[Math.floor(Math.random() * QUOTES.length)]!;
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle("💬 Inspirational Quote")
        .setDescription(`*"${q.quote}"*`)
        .setFooter({ text: `— ${q.author}` }),
    ],
  });
}

export async function handleRoast(message: Message): Promise<void> {
  const target = message.mentions.members?.first() ?? null;
  const name = target?.displayName ?? message.author.username;
  const roast = ROASTS[Math.floor(Math.random() * ROASTS.length)]!;
  await message.reply({
    embeds: [new EmbedBuilder().setColor(C).setTitle(`🔥 Roast: ${name}`).setDescription(roast)],
  });
}

export async function handleCompliment(message: Message): Promise<void> {
  const target = message.mentions.members?.first() ?? null;
  const name = target?.displayName ?? message.author.username;
  const c = COMPLIMENTS[Math.floor(Math.random() * COMPLIMENTS.length)]!;
  await message.reply({
    embeds: [new EmbedBuilder().setColor(C).setTitle(`💝 Compliment for ${name}`).setDescription(c)],
  });
}

export async function handleTopic(message: Message): Promise<void> {
  const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)]!;
  await message.reply({
    embeds: [new EmbedBuilder().setColor(C).setTitle("💬 Conversation Topic").setDescription(topic)],
  });
}

export async function handleShip(message: Message): Promise<void> {
  const members = message.mentions.members;
  if (!members || members.size < 2) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!ship @user1 @user2`")] });
    return;
  }
  const [a, b] = [...members.values()];
  const seed = (a!.id + b!.id).split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  const score = ((seed * 1234567) % 101 + 101) % 101;
  const bar = "█".repeat(Math.floor(score / 10)) + "░".repeat(10 - Math.floor(score / 10));
  const emoji = score >= 80 ? "💞" : score >= 60 ? "💕" : score >= 40 ? "💛" : score >= 20 ? "🤔" : "💔";
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle(`${emoji} Ship Meter`)
        .setDescription(`**${a!.displayName}** 💘 **${b!.displayName}**\n\n\`[${bar}] ${score}%\``)
        .setFooter({ text: score >= 80 ? "Perfect match! 💕" : score >= 60 ? "Pretty good!" : score >= 40 ? "Meh..." : score >= 20 ? "Not great..." : "Maybe just friends 😅" }),
    ],
  });
}

export async function handleRate(message: Message): Promise<void> {
  const args = message.content.trim().split(/\s+/).slice(1);
  const thing = args.join(" ") || "you";
  const seed = thing.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  const score = ((seed * 7919) % 11 + 11) % 11;
  const bar = "⭐".repeat(score) + "☆".repeat(10 - score);
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle("⭐ Rating")
        .setDescription(`**${thing}** — \`${bar}\` **${score}/10**`),
    ],
  });
}

export async function handleReverse(message: Message): Promise<void> {
  const text = message.content.trim().replace(/^!reverse\s*/i, "").trim();
  if (!text) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!reverse <text>`")] });
    return;
  }
  const reversed = [...text].reverse().join("");
  await message.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle("🔄 Reversed").setDescription(reversed)] });
}

export async function handleMock(message: Message): Promise<void> {
  const text = message.content.trim().replace(/^!mock\s*/i, "").trim();
  if (!text) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!mock <text>`")] });
    return;
  }
  const mocked = text.split("").map((c, i) => i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()).join("");
  await message.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle("🐸 Mocking").setDescription(mocked)] });
}

export async function handleClap(message: Message): Promise<void> {
  const text = message.content.trim().replace(/^!clap\s*/i, "").trim();
  if (!text) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!clap <text>`")] });
    return;
  }
  const clapped = text.split(" ").join(" 👏 ");
  await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(clapped)] });
}

export async function handleUpper(message: Message): Promise<void> {
  const text = message.content.trim().replace(/^!upper\s*/i, "").trim();
  if (!text) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!upper <text>`")] }); return; }
  await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(text.toUpperCase())] });
}

export async function handleLower(message: Message): Promise<void> {
  const text = message.content.trim().replace(/^!lower\s*/i, "").trim();
  if (!text) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!lower <text>`")] }); return; }
  await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(text.toLowerCase())] });
}

export async function handleEmojify(message: Message): Promise<void> {
  const text = message.content.trim().replace(/^!emojify\s*/i, "").trim();
  if (!text) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!emojify <text>`")] }); return; }
  const emojified = text.toLowerCase().split("").map((c) => {
    if (c >= "a" && c <= "z") return `:regional_indicator_${c}: `;
    if (c === " ") return "   ";
    return c;
  }).join("");
  await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(emojified.slice(0, 2000))] });
}

export async function handleBinary(message: Message): Promise<void> {
  const text = message.content.trim().replace(/^!binary\s*/i, "").trim();
  if (!text) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!binary <text>`")] }); return; }
  const bin = text.split("").map((c) => c.charCodeAt(0).toString(2).padStart(8, "0")).join(" ");
  await message.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle("01 Binary").setDescription(`\`\`\`${bin.slice(0, 1990)}\`\`\``)] });
}

export async function handleMorse(message: Message): Promise<void> {
  const text = message.content.trim().replace(/^!morse\s*/i, "").trim();
  if (!text) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!morse <text>`")] }); return; }
  const morse = text.toLowerCase().split("").map((c) => MORSE_CODE[c] ?? "?").join(" ");
  await message.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle("📡 Morse Code").setDescription(`\`${morse.slice(0, 1990)}\``)] });
}

export async function handleBase64(message: Message): Promise<void> {
  const args = message.content.trim().split(/\s+/).slice(1);
  const mode = args[0]?.toLowerCase();
  const text = args.slice(1).join(" ");
  if ((mode !== "encode" && mode !== "decode") || !text) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!base64 encode <text>` or `!base64 decode <text>`")] });
    return;
  }
  try {
    const result = mode === "encode"
      ? Buffer.from(text, "utf8").toString("base64")
      : Buffer.from(text, "base64").toString("utf8");
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle(`🔐 Base64 ${mode}`).setDescription(`\`\`\`${result.slice(0, 1990)}\`\`\``)] });
  } catch {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Failed to decode. Make sure the input is valid base64.")] });
  }
}

export async function handlePassword(message: Message): Promise<void> {
  const args = message.content.trim().split(/\s+/).slice(1);
  const len = Math.min(Math.max(parseInt(args[0] ?? "16") || 16, 4), 64);
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}";
  const password = Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle("🔑 Generated Password")
        .setDescription(`\`${password}\``)
        .setFooter({ text: "This was sent as a reply — only you can see it in context." }),
    ],
  });
}

export async function handleRandomNumber(message: Message): Promise<void> {
  const args = message.content.trim().split(/\s+/).slice(1);
  const min = parseInt(args[0] ?? "1");
  const max = parseInt(args[1] ?? args[0] ?? "100");
  if (isNaN(min) || isNaN(max) || min > max) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!random [min] [max]` e.g. `!random 1 100`")] });
    return;
  }
  const num = Math.floor(Math.random() * (max - min + 1)) + min;
  await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`🎲 Random number between **${min}** and **${max}**: **${num}**`)] });
}

export async function handlePercent(message: Message): Promise<void> {
  const p = Math.floor(Math.random() * 101);
  await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`🎯 **${p}%**`)] });
}

export async function handleYesNo(message: Message): Promise<void> {
  const answer = Math.random() < 0.5 ? "✅ **Yes!**" : "❌ **No!**";
  await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(answer)] });
}

export async function handleLength(message: Message): Promise<void> {
  const text = message.content.trim().replace(/^!length\s*/i, "").trim();
  if (!text) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!length <text>`")] }); return; }
  const chars = text.length;
  const words = text.trim().split(/\s+/).length;
  const lines = text.split("\n").length;
  await message.reply({
    embeds: [
      new EmbedBuilder().setColor(C).setTitle("📏 Text Stats")
        .addFields(
          { name: "Characters", value: `\`${chars}\``, inline: true },
          { name: "Words", value: `\`${words}\``, inline: true },
          { name: "Lines", value: `\`${lines}\``, inline: true },
        ),
    ],
  });
}

export async function handleTempConvert(message: Message): Promise<void> {
  const args = message.content.trim().split(/\s+/).slice(1);
  const val = parseFloat(args[0] ?? "");
  const unit = args[1]?.toLowerCase();
  if (isNaN(val) || !unit) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!temp <value> <c|f|k>` e.g. `!temp 100 c`")] });
    return;
  }
  let result = "";
  if (unit === "c") {
    result = `**${val}°C** = **${(val * 9 / 5 + 32).toFixed(2)}°F** = **${(val + 273.15).toFixed(2)}K**`;
  } else if (unit === "f") {
    result = `**${val}°F** = **${((val - 32) * 5 / 9).toFixed(2)}°C** = **${((val - 32) * 5 / 9 + 273.15).toFixed(2)}K**`;
  } else if (unit === "k") {
    result = `**${val}K** = **${(val - 273.15).toFixed(2)}°C** = **${((val - 273.15) * 9 / 5 + 32).toFixed(2)}°F**`;
  } else {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Unit must be `c`, `f`, or `k`.")] });
    return;
  }
  await message.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle("🌡️ Temperature Conversion").setDescription(result)] });
}

export async function handleUrban(message: Message): Promise<void> {
  const term = message.content.trim().replace(/^!urban\s*/i, "").trim();
  if (!term) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!urban <word>`")] });
    return;
  }
  const data = await safeFetch(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`) as { list?: Array<{ word: string; definition: string; example: string; thumbs_up: number; thumbs_down: number; permalink: string }> } | null;
  const entry = data?.list?.[0];
  if (!entry) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`❌ No definition found for **${term}**.`)] });
    return;
  }
  const def = entry.definition.replace(/\[([^\]]+)\]/g, "$1").slice(0, 1024);
  const ex = entry.example.replace(/\[([^\]]+)\]/g, "$1").slice(0, 512);
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle(`📖 Urban Dictionary: ${entry.word}`)
        .addFields(
          { name: "Definition", value: def || "No definition", inline: false },
          { name: "Example", value: ex ? `*${ex}*` : "None", inline: false },
          { name: "👍", value: `${entry.thumbs_up}`, inline: true },
          { name: "👎", value: `${entry.thumbs_down}`, inline: true },
        )
        .setURL(entry.permalink),
    ],
  });
}

export async function handleWikipedia(message: Message): Promise<void> {
  const query = message.content.trim().replace(/^!wiki\s*/i, "").trim();
  if (!query) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!wiki <topic>`")] });
    return;
  }
  const searchData = await safeFetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`
  ) as { title?: string; extract?: string; thumbnail?: { source: string }; content_urls?: { desktop?: { page?: string } } } | null;
  if (!searchData?.extract) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`❌ No Wikipedia article found for **${query}**.`)] });
    return;
  }
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle(`📚 ${searchData.title}`)
        .setDescription(searchData.extract.slice(0, 2048))
        .setThumbnail(searchData.thumbnail?.source ?? null)
        .setURL(searchData.content_urls?.desktop?.page ?? "https://wikipedia.org")
        .setFooter({ text: "Source: Wikipedia" }),
    ],
  });
}

export async function handleCat(message: Message): Promise<void> {
  const data = await safeFetch("https://api.thecatapi.com/v1/images/search") as Array<{ url?: string }> | null;
  const url = data?.[0]?.url;
  if (!url) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Couldn't fetch a cat. Try again!")] }); return; }
  await message.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle("🐱 Random Cat").setImage(url)] });
}

export async function handleDog(message: Message): Promise<void> {
  const data = await safeFetch("https://dog.ceo/api/breeds/image/random") as { message?: string } | null;
  const url = data?.message;
  if (!url) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Couldn't fetch a dog. Try again!")] }); return; }
  await message.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle("🐶 Random Dog").setImage(url)] });
}

export async function handleFox(message: Message): Promise<void> {
  const data = await safeFetch("https://randomfox.ca/floof/") as { image?: string } | null;
  const url = data?.image;
  if (!url) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Couldn't fetch a fox. Try again!")] }); return; }
  await message.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle("🦊 Random Fox").setImage(url)] });
}

export async function handleDuck(message: Message): Promise<void> {
  const data = await safeFetch("https://random-d.uk/api/random") as { url?: string } | null;
  const url = data?.url;
  if (!url) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Couldn't fetch a duck. Try again!")] }); return; }
  await message.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle("🦆 Random Duck").setImage(url)] });
}

// nekos.best endpoint mapping (each call returns a different anime GIF)
const NEKOS_ENDPOINTS: Record<string, string> = {
  hug: "hug",
  kiss: "kiss",
  pat: "pat",
  slap: "slap",
  poke: "poke",
  cuddle: "cuddle",
  bite: "bite",
  wave: "wave",
  highfive: "handhold",
  cry: "cry",
  bonk: "bonk",
  kill: "shoot",
};

// Multiple phrases per action for variety
const ACTION_PHRASES: Record<string, string[]> = {
  hug:      ["gave a warm hug to", "hugged", "squeezed", "wrapped their arms around"],
  kiss:     ["kissed", "planted a kiss on", "smooched", "gave a sweet kiss to"],
  pat:      ["patted", "gave head pats to", "gently patted", "head-patted"],
  slap:     ["slapped", "smacked", "SLAPPED", "yeeted a slap at"],
  poke:     ["poked", "booped", "gently poked", "👉 poked at"],
  cuddle:   ["cuddled", "snuggled with", "cuddled up to", "held close"],
  bite:     ["bit", "nibbled on", "chomped", "gently bit"],
  wave:     ["waved at", "waved hello to"],
  highfive: ["high-fived", "gave a high five to", "✋ high-fived"],
  cry:      ["is crying...", "broke down crying..."],
  bonk:     ["bonked 🔨", "BONKED", "gently bonked", "🔨 smacked"],
  kill:     ["eliminated ☠️", "defeated", "destroyed", "utterly annihilated", "sent to the shadow realm"],
};

function randomPhrase(action: string): string {
  const list = ACTION_PHRASES[action] ?? [action];
  return list[Math.floor(Math.random() * list.length)]!;
}

async function socialAction(message: Message, action: string, emoji: string, _label: string, targetRequired: boolean): Promise<void> {
  const target = message.mentions.members?.first();
  if (targetRequired && !target) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`❌ Usage: \`!${action} @user\``)] });
    return;
  }

  // Try nekos.best first (different anime GIF every time)
  const endpoint = NEKOS_ENDPOINTS[action] ?? action;
  const nkData = await safeFetch(`https://nekos.best/api/v2/${endpoint}`) as { results?: Array<{ url: string }> } | null;
  let gif = nkData?.results?.[0]?.url;

  // Fallback to waifu.pics if nekos.best fails
  if (!gif) {
    const wpData = await safeFetch(`https://api.waifu.pics/sfw/${action}`) as { url?: string } | null;
    gif = wpData?.url;
  }

  const phrase = randomPhrase(action);
  const desc = target
    ? `**${message.author.username}** ${phrase} **${target.displayName}** ${emoji}`
    : `**${message.author.username}** ${phrase} ${emoji}`;

  const embed = new EmbedBuilder().setColor(C).setDescription(desc);
  if (gif) embed.setImage(gif);
  await message.reply({ embeds: [embed] });
}

export async function handleHug(message: Message): Promise<void> { await socialAction(message, "hug", "🤗", "hugged", true); }
export async function handlePat(message: Message): Promise<void> { await socialAction(message, "pat", "✋", "patted", true); }
export async function handleSlap(message: Message): Promise<void> { await socialAction(message, "slap", "👋", "slapped", true); }
export async function handlePoke(message: Message): Promise<void> { await socialAction(message, "poke", "👉", "poked", true); }
export async function handleKiss(message: Message): Promise<void> { await socialAction(message, "kiss", "💋", "kissed", true); }
export async function handleWave(message: Message): Promise<void> { await socialAction(message, "wave", "👋", "waved at", false); }
export async function handleHighfive(message: Message): Promise<void> { await socialAction(message, "highfive", "✋", "high-fived", true); }
export async function handleCry(message: Message): Promise<void> { await socialAction(message, "cry", "😢", "is crying...", false); }
export async function handleCuddle(message: Message): Promise<void> { await socialAction(message, "cuddle", "🥰", "cuddled", true); }
export async function handleBite(message: Message): Promise<void> { await socialAction(message, "bite", "😬", "bit", true); }
export async function handleBonk(message: Message): Promise<void> { await socialAction(message, "bonk", "🔨", "bonked", true); }
export async function handleKill(message: Message): Promise<void> { await socialAction(message, "kill", "☠️", "killed", true); }

export async function handleRPS(message: Message): Promise<void> {
  const args = message.content.trim().split(/\s+/).slice(1);
  const choice = args[0]?.toLowerCase();
  const valid = ["rock", "paper", "scissors", "r", "p", "s"];
  const map: Record<string, string> = { r: "rock", p: "paper", s: "scissors" };
  const normalizedChoice = map[choice ?? ""] ?? choice ?? "";
  if (!valid.includes(choice ?? "") || !["rock", "paper", "scissors"].includes(normalizedChoice)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!rps <rock|paper|scissors>`")] });
    return;
  }
  const moves = ["rock", "paper", "scissors"];
  const emojis: Record<string, string> = { rock: "🪨", paper: "📄", scissors: "✂️" };
  const botMove = moves[Math.floor(Math.random() * 3)]!;
  const userMove = normalizedChoice;
  let result: string;
  if (userMove === botMove) result = "🤝 **It's a tie!**";
  else if ((userMove === "rock" && botMove === "scissors") || (userMove === "paper" && botMove === "rock") || (userMove === "scissors" && botMove === "paper"))
    result = "🎉 **You win!**";
  else result = "💀 **You lose!**";
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle("✂️ Rock Paper Scissors")
        .addFields(
          { name: "You", value: `${emojis[userMove]} ${userMove}`, inline: true },
          { name: "Bot", value: `${emojis[botMove]} ${botMove}`, inline: true },
          { name: "Result", value: result, inline: false },
        ),
    ],
  });
}

export async function handleSlots(message: Message): Promise<void> {
  const symbols = ["🍒", "🍋", "🍊", "🍇", "⭐", "💎", "🎰", "🃏"];
  const roll = () => symbols[Math.floor(Math.random() * symbols.length)]!;
  const [a, b, c] = [roll(), roll(), roll()];
  const win = a === b && b === c;
  const almostWin = a === b || b === c || a === c;
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle("🎰 Slot Machine")
        .setDescription(`\`[ ${a} | ${b} | ${c} ]\`\n\n${win ? "🎉 **JACKPOT! You win!**" : almostWin ? "💛 **So close! Two matching!**" : "❌ **No match. Try again!**"}`)
    ],
  });
}

interface TriviaQuestion {
  category: string;
  difficulty: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

const triviaAnswers = new Map<string, string>();

export async function handleTrivia(message: Message): Promise<void> {
  const data = await safeFetch("https://opentdb.com/api.php?amount=1&type=multiple&encode=url3986") as { response_code?: number; results?: TriviaQuestion[] } | null;
  const q = data?.results?.[0];
  if (!q || data?.response_code !== 0) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Couldn't fetch a trivia question. Try again!")] });
    return;
  }
  const question = decodeHtml(q.question);
  const correct = decodeHtml(q.correct_answer);
  const incorrect = q.incorrect_answers.map(decodeHtml);
  const all = [...incorrect, correct].sort(() => Math.random() - 0.5);
  const letters = ["A", "B", "C", "D"];
  const options = all.map((opt, i) => `**${letters[i]}.** ${opt}`).join("\n");
  triviaAnswers.set(message.channel.id, correct);
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle(`🧠 Trivia — ${decodeHtml(q.category)}`)
        .setDescription(`**${question}**\n\n${options}`)
        .setFooter({ text: `Difficulty: ${q.difficulty} • Reply with A, B, C, or D within 30s` }),
    ],
  });

  const filter = (m: Message) =>
    m.author.id === message.author.id &&
    ["a", "b", "c", "d"].includes(m.content.trim().toLowerCase().charAt(0));

  try {
    const collected = await (message.channel as TextChannel).awaitMessages({ filter, max: 1, time: 30_000, errors: ["time"] });
    const answer = collected.first()!;
    const chosen = answer.content.trim().toLowerCase().charAt(0);
    const chosenAnswer = all[letters.indexOf(chosen.toUpperCase())]!;
    triviaAnswers.delete(message.channel.id);
    if (chosenAnswer === correct) {
      await answer.reply({ embeds: [new EmbedBuilder().setColor(0x00ff00).setDescription(`✅ **Correct!** The answer was **${correct}**.`)] });
    } else {
      await answer.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`❌ **Wrong!** The correct answer was **${correct}**.`)] });
    }
  } catch {
    triviaAnswers.delete(message.channel.id);
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`⏰ Time's up! The correct answer was **${correct}**.`)] });
  }
}

const guessGames = new Map<string, number>();

export async function handleGuess(message: Message): Promise<void> {
  if (guessGames.has(message.channel.id)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ A guess game is already running in this channel!")] });
    return;
  }
  const args = message.content.trim().split(/\s+/).slice(1);
  const max = Math.min(parseInt(args[0] ?? "100") || 100, 10000);
  const num = Math.floor(Math.random() * max) + 1;
  guessGames.set(message.channel.id, num);
  await message.reply({
    embeds: [new EmbedBuilder().setColor(C).setTitle("🔢 Guess the Number").setDescription(`I'm thinking of a number between **1** and **${max}**.\n\nYou have 5 attempts! Type a number to guess.`)],
  });

  let attempts = 0;
  const maxAttempts = 5;
  const filter = (m: Message) => m.author.id === message.author.id && !isNaN(parseInt(m.content.trim()));

  const collector = (message.channel as TextChannel).createMessageCollector({ filter, time: 60_000, max: maxAttempts });

  collector.on("collect", async (m: Message) => {
    const guess = parseInt(m.content.trim());
    attempts++;
    if (guess === num) {
      collector.stop("win");
      guessGames.delete(message.channel.id);
      await m.reply({ embeds: [new EmbedBuilder().setColor(0x00ff00).setDescription(`🎉 **Correct!** The number was **${num}**! You got it in **${attempts}** attempt${attempts !== 1 ? "s" : ""}!`)] });
    } else if (attempts >= maxAttempts) {
      collector.stop("lose");
    } else {
      const hint = guess < num ? "📈 Too low!" : "📉 Too high!";
      await m.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`${hint} **${maxAttempts - attempts}** attempt${maxAttempts - attempts !== 1 ? "s" : ""} left.`)] });
    }
  });

  collector.on("end", async (_collected: unknown, reason: string) => {
    if (reason === "win") return;
    guessGames.delete(message.channel.id);
    if (reason !== "win") {
      await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`💀 Game over! The number was **${num}**!`)] });
    }
  });
}
