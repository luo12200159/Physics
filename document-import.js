(() => {
  "use strict";

  const MAX_LOCAL_TEXT = 400000;
  const ALLOWED_GRADES = ["八年级", "九年级", "高一", "高二", "高三"];

  async function analyze(file, context = {}) {
    const security = window.PhysicsStudioSecurity;
    if (!security) throw new Error("文件安全检查模块未加载。");
    const inspection = await security.inspectFile(file, "document");
    await security.ensureStorageCapacity(file.size * 2);

    let localResult = null;
    if (inspection.kind === "zip" && inspection.extension === "docx") {
      localResult = await parseDocx(file, context);
    } else if (["jpeg", "png", "gif", "webp"].includes(inspection.kind)) {
      localResult = await parseImage(file, context);
    }

    if (localResult?.questions?.length) {
      return {
        ...localResult,
        file: inspection,
        parser: "device",
        reviewRequired: true,
        boundary: "本机预解析只提取文字并按题号分段。公式、图形、选项、单位和答案必须逐题确认。"
      };
    }

    const ai = window.PhysicsStudioAITutor;
    if (ai?.status?.().ready) {
      const result = await ai.analyzeDocument(file, context);
      return {
        ...result,
        file: inspection,
        parser: "configured-ai-gateway",
        reviewRequired: true,
        boundary: "解析结果必须经教师逐题核对后才能进入正式题库；不确定字符和缺图题不会自动发布。"
      };
    }

    return {
      questions: [],
      warnings: [
        inspection.kind === "pdf"
          ? "当前离线版未内置 PDF 文字层/OCR 引擎。请配置受控 ChatGPT 服务端，或先把页面导出为图片后使用设备 OCR。"
          : inspection.kind === "ole"
            ? "旧版 .doc 不能在浏览器内可靠解析。请另存为 .docx，或配置受控 ChatGPT 服务端。"
            : "设备没有提供可用的离线文字识别能力。"
      ],
      file: inspection,
      parser: "unavailable",
      reviewRequired: true,
      boundary: "文件已通过文件头和大小检查，但尚未生成题目，不会写入题库。"
    };
  }

  async function parseDocx(file, context) {
    const archive = window.fflate;
    if (!archive?.unzipSync || !archive?.strFromU8) {
      throw new Error("DOCX 解压模块未加载。");
    }
    const entries = archive.unzipSync(new Uint8Array(await file.arrayBuffer()));
    if (!entries["[Content_Types].xml"] || !entries["word/document.xml"]) {
      throw new Error("文件头是 ZIP，但内容不是有效 DOCX 文档。");
    }
    const xml = archive.strFromU8(entries["word/document.xml"]);
    if (xml.length > MAX_LOCAL_TEXT * 8) throw new Error("DOCX 文本内容超过本机解析上限。");
    const text = docxXmlToText(xml).slice(0, MAX_LOCAL_TEXT);
    const questions = splitQuestions(text, context);
    return {
      questions,
      warnings: questions.length
        ? ["DOCX 中的公式对象、图片和复杂表格可能未转成纯文本，请对照原文逐题核对。"]
        : ["DOCX 未提取到可按题号识别的正文。"],
      extractedTextLength: text.length
    };
  }

  function docxXmlToText(xml) {
    return decodeXmlEntities(
      String(xml)
        .replace(/<w:tab\b[^>]*\/>/g, "\t")
        .replace(/<w:br\b[^>]*\/>/g, "\n")
        .replace(/<\/w:p>/g, "\n")
        .replace(/<\/w:tr>/g, "\n")
        .replace(/<\/w:tc>/g, "\t")
        .replace(/<[^>]+>/g, "")
    )
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function decodeXmlEntities(value) {
    return value
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  async function parseImage(file, context) {
    if (typeof globalThis.TextDetector !== "function") {
      return { questions: [], warnings: ["当前设备未提供 TextDetector 离线文字识别。"] };
    }
    const bitmap = await createImageBitmap(file);
    try {
      const detector = new TextDetector();
      const blocks = await detector.detect(bitmap);
      const text = blocks
        .slice()
        .sort((a, b) => (a.boundingBox?.top || 0) - (b.boundingBox?.top || 0)
          || (a.boundingBox?.left || 0) - (b.boundingBox?.left || 0))
        .map((block) => String(block.rawValue || "").trim())
        .filter(Boolean)
        .join("\n")
        .slice(0, MAX_LOCAL_TEXT);
      return {
        questions: splitQuestions(text, context),
        warnings: text
          ? ["设备 OCR 不保证正确识别公式、上下标、矢量符号和示意图；无法确认的字符应改为“□”。"]
          : ["设备 OCR 未识别到文字。"],
        extractedTextLength: text.length
      };
    } finally {
      bitmap.close?.();
    }
  }

  function splitQuestions(rawText, context = {}) {
    const text = String(rawText || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .trim();
    if (!text) return [];

    const numbered = text
      .replace(/(?:^|\n)\s*(?:第\s*)?(\d{1,3})\s*(?:题|[.．、])\s*/g, "\n@@QUESTION:$1@@ ")
      .split(/\n(?=@@QUESTION:\d+@@)/)
      .map((part) => part.trim())
      .filter(Boolean);
    const parts = numbered.length > 1 || /^@@QUESTION:/.test(numbered[0] || "")
      ? numbered
      : [text];

    return parts.slice(0, 200).map((part, index) => {
      const numberMatch = part.match(/^@@QUESTION:(\d+)@@\s*/);
      const number = numberMatch?.[1] || String(index + 1);
      const body = part.replace(/^@@QUESTION:\d+@@\s*/, "").trim();
      const answerSplit = body.split(/\n\s*(?:参考)?答案\s*[:：]\s*/i);
      const contentAndSolution = answerSplit[0] || "";
      const answerAndSolution = answerSplit.slice(1).join("\n答案：").trim();
      const solutionSplit = contentAndSolution.split(/\n\s*(?:解析|解答|解题过程)\s*[:：]\s*/i);
      const answerSolutionSplit = answerAndSolution.split(/\n\s*(?:解析|解答|解题过程)\s*[:：]\s*/i);
      const content = (solutionSplit[0] || "").trim();
      const solution = (solutionSplit.slice(1).join("\n") || answerSolutionSplit.slice(1).join("\n")).trim();
      const answer = (answerSolutionSplit[0] || "").trim();
      const firstLine = content.split("\n").find(Boolean) || `第 ${number} 题`;
      return {
        title: `${String(context.titlePrefix || "上传试卷").slice(0, 80)} 第${number}题｜${firstLine.slice(0, 40)}`,
        content,
        answer,
        solution,
        stage: ["初中", "高中"].includes(context.stage) ? context.stage : "初中",
        grade: ALLOWED_GRADES.includes(context.grade) ? context.grade : "八年级",
        topic: String(context.topic || "待教师核对").slice(0, 100),
        difficulty: "进阶",
        examPoints: [],
        uncertainFragments: /□/.test(content) ? ["题干含“□”不确定字符"] : [],
        requiresImageReview: false,
        reviewRequired: true
      };
    }).filter((question) => question.content);
  }

  window.PhysicsStudioDocumentImport = Object.freeze({
    version: "1.0.0",
    analyze,
    splitQuestions,
    docxXmlToText
  });
})();
