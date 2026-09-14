export function calculateNutrition(meals) {
  return meals.reduce(
    (total, meal) => ({
      calories: total.calories + Number(meal.calories || 0),
      protein: total.protein + Number(meal.protein || 0),
      carbs: total.carbs + Number(meal.carbs || 0),
      fat: total.fat + Number(meal.fat || 0)
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

export function createWorkoutSet(weight, reps) {
  return { weight: Number(weight), reps: Number(reps) };
}

export function estimateFood(note) {
  const text = note.toLowerCase();
  const catalog = [
    ["鸡胸", { calories: 220, protein: 42, carbs: 0, fat: 5 }],
    ["鸡腿", { calories: 310, protein: 31, carbs: 6, fat: 17 }],
    ["米饭", { calories: 230, protein: 4, carbs: 51, fat: 1 }],
    ["面", { calories: 430, protein: 18, carbs: 62, fat: 12 }],
    ["蛋白粉", { calories: 120, protein: 24, carbs: 3, fat: 2 }],
    ["鸡蛋", { calories: 140, protein: 12, carbs: 1, fat: 10 }],
    ["沙拉", { calories: 260, protein: 20, carbs: 21, fat: 11 }]
  ];
  return catalog.find(([keyword]) => text.includes(keyword))?.[1] ?? { calories: 380, protein: 20, carbs: 45, fat: 12 };
}

export function answerCoach(question, context) {
  const q = question.replace(/\s/g, "");
  const nutrition = context.nutrition;
  if (q.includes("热量") || q.includes("吃了多少")) {
    return `今天已记录 ${nutrition.calories} kcal，蛋白质 ${nutrition.protein} g、碳水 ${nutrition.carbs} g、脂肪 ${nutrition.fat} g。想更准确的话，可以补充每餐的克重和用油量。`;
  }
  if (q.includes("蛋白")) {
    return `今天已记录蛋白质 ${nutrition.protein} g。训练日可以把蛋白质分配到 3–5 餐，优先用你实际的体重与目标来决定总量。`;
  }
  if (q.includes("卧推")) {
    const bench = context.workouts.flatMap(workout => workout.exercises).find(exercise => exercise.name.includes("卧推"));
    if (bench) {
      const latest = bench.sets.at(-1);
      return `你最近记录的${bench.name}最后一组是 ${latest.weight} kg × ${latest.reps} 次。下次状态好时可先尝试多做 1 次，再考虑加重量。`;
    }
    return "我还没有找到卧推记录。你可以先在训练页添加一次训练。";
  }
  if (q.includes("训练") || q.includes("计划")) {
    return `你已经记录了 ${context.workouts.length} 次训练。可以先保持动作和重量稳定，再用完成次数、重量或组数中的一个指标逐步进步。`;
  }
  return "我可以根据你的记录回答训练、热量和蛋白质问题。试试问我“今天吃了多少热量？”或“我上次卧推做了多少？”。";
}
