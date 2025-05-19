export function improveBiomedicalParsing(text: string): string {
  const terms = [ "enzyme-substrate complex", "rate-limiting step", "Michaelis-Menten kinetics", "signal transduction", "glycolysis", "DNA replication", "RNA polymerase", "oxidative phosphorylation" ];
  const phrases = text.replace(/\n/g, " ").split(/(?<=[.!?])\s+/).flatMap(sentence => {
    for (let term of terms) sentence = sentence.replace(new RegExp(term, "gi"), `§${term}§`);
    return sentence.split(/(?=§)|(?<=§)/);
  });

  let toggle = true;
  return phrases.map(p => {
    const clean = p.replace(/§/g, "");
    const color = toggle ? "black" : "gray";
    if (!clean.trim()) return "";
    toggle = !toggle;
    return `<span style="color:${color}">${clean.trim()} </span>`;
  }).join("");
}