import { EmbedBuilder, type Message } from "discord.js";

export function safeCalc(expr: string): { result: string; error?: string } {
  const cleaned = expr.trim();
  if (!cleaned) return { result: "", error: "❌ Please provide a math expression." };
  if (cleaned.length > 200) return { result: "", error: "❌ Expression too long." };
  if (!/^[\d\s+\-*/%.()^,sqrtabcefiloundMPIghijkmnopqruvwxyzSQRTABCEFILOUNDMPIGHIJKMNOPQRUVWXYZ]*$/i.test(cleaned)) {
    return { result: "", error: "❌ Invalid characters in expression." };
  }
  try {
    const processed = cleaned.replace(/\^/g, "**");
    const result = new Function(
      "sqrt", "abs", "ceil", "floor", "round", "min", "max", "pow", "PI", "E", "log", "sin", "cos", "tan", "log2", "log10",
      `"use strict"; return (${processed});`
    )(
      Math.sqrt, Math.abs, Math.ceil, Math.floor, Math.round, Math.min, Math.max, Math.pow,
      Math.PI, Math.E, Math.log, Math.sin, Math.cos, Math.tan, Math.log2, Math.log10
    ) as unknown;
    if (typeof result !== "number") return { result: "", error: "❌ Result is not a number." };
    if (!isFinite(result)) return { result: "", error: "❌ Result is Infinity or NaN." };
    const str = Number.isInteger(result) ? result.toString() : result.toPrecision(10).replace(/\.?0+$/, "");
    return { result: str };
  } catch {
    return { result: "", error: "❌ Could not evaluate expression. Check your syntax." };
  }
}

export async function handleCalc(message: Message): Promise<void> {
  const expr = message.content.trim().replace(/^!calc\s*/i, "");
  if (!expr) {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("🧮 Calculator")
          .setDescription("**Usage:** `!calc <expression>`\n**Examples:**\n`!calc 2 + 2`\n`!calc sqrt(144)`\n`!calc (10 * 3) / 2`\n`!calc 2^10`\n\n**Supported:** `+`, `-`, `*`, `/`, `%`, `^`, `sqrt()`, `abs()`, `ceil()`, `floor()`, `round()`, `sin()`, `cos()`, `tan()`, `log()`, `PI`, `E`"),
      ],
    });
    return;
  }
  const { result, error } = safeCalc(expr);
  if (error) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription(error)] });
    return;
  }
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("🧮 Calculator")
        .addFields(
          { name: "Expression", value: `\`${expr}\``, inline: false },
          { name: "Result", value: `\`\`\`${result}\`\`\``, inline: false },
        ),
    ],
  });
}
