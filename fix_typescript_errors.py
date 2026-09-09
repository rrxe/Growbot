from pathlib import Path

def replace_once(path, old, new):
    p = Path(path)
    s = p.read_text()
    if old not in s:
        print(f"[FAIL] {path}: النص غير موجود")
        return False
    if s.count(old) != 1:
        print(f"[FAIL] {path}: النص موجود {s.count(old)} مرات")
        return False
    p.write_text(s.replace(old, new, 1))
    print(f"[OK] {path}")
    return True


# 1) ctx.from possibly undefined
replace_once(
    "bot/index.ts",
    """          await sendHome(
            ctx,
            ctx.from.id
          )""",
    """          if (!ctx.from) {
            return
          }

          await sendHome(
            ctx,
            ctx.from.id
          )"""
)

# 2-4) grammY answerPreCheckoutQuery expects an object
replace_once(
    "bot/index.ts",
    """          await ctx.answerPreCheckoutQuery(
            'تعذر العثور على الطلب.'
          )""",
    """          await ctx.answerPreCheckoutQuery({
            ok: false,
            error_message: 'تعذر العثور على الطلب.'
          })"""
)

replace_once(
    "bot/index.ts",
    """          await ctx.answerPreCheckoutQuery(
            'قيمة الفاتورة غير صحيحة.'
          )""",
    """          await ctx.answerPreCheckoutQuery({
            ok: false,
            error_message: 'قيمة الفاتورة غير صحيحة.'
          })"""
)

replace_once(
    "bot/index.ts",
    """        await ctx.answerPreCheckoutQuery(
          'حدث خطأ مؤقت. حاول مرة أخرى.'
        )""",
    """        await ctx.answerPreCheckoutQuery({
          ok: false,
          error_message: 'حدث خطأ مؤقت. حاول مرة أخرى.'
        })"""
)

# 5) completionId string | string[] -> string
replace_once(
    "server/routes/tasks.ts",
    """        completionId,""",
    """        completionId: Array.isArray(completionId)
          ? completionId[0]
          : completionId,"""
)

print("\\nتم إصلاح الأخطاء المحددة.")
