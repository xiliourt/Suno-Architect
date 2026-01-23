import { AlignedWord, Qt6Style } from '../types';
import { Type, GoogleGenAI } from "@google/genai";

export const hexToRgba = (hex: string, alpha: number) => {
    let c: any;
    if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
        c= hex.substring(1).split('');
        if(c.length== 3) c= [c[0], c[0], c[1], c[1], c[2], c[2]];
        c= '0x'+c.join('');
        return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+','+alpha+')';
    }
    return `rgba(255,255,255,${alpha})`;
};

export const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
};

export const drawCover = (ctx: CanvasRenderingContext2D, img: CanvasImageSource | HTMLVideoElement | HTMLImageElement, w: number, h: number) => {
    let imgW = 0; let imgH = 0;
    if (img instanceof HTMLVideoElement) { imgW = img.videoWidth; imgH = img.videoHeight; } 
    else if (img instanceof HTMLImageElement) { imgW = img.naturalWidth || img.width; imgH = img.naturalHeight || img.height; }
    if (!imgW || !imgH) return;
    const imgRatio = imgW / imgH; const winRatio = w / h;
    let drawW, drawH, startX, startY;
    if (imgRatio > winRatio) { drawH = h; drawW = h * imgRatio; startX = (w - drawW) / 2; startY = 0; } 
    else { drawW = w; drawH = w / imgRatio; startX = 0; startY = (h - drawH) / 2; }
    ctx.drawImage(img, startX, startY, drawW, drawH);
};

const drawRadialBar = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, h: number, angle: number) => {
    const x1 = cx + Math.cos(angle) * r;
    const y1 = cy + Math.sin(angle) * r;
    const x2 = cx + Math.cos(angle) * (r + h);
    const y2 = cy + Math.sin(angle) * (r + h);
    
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
};

export const drawQt6Visualizer = (
    ctx: CanvasRenderingContext2D, 
    width: number, 
    height: number, 
    data: Uint8Array | Float32Array, 
    type: Qt6Style,
    settings: { activeColor: string; qt6Sensitivity: number; qt6BarCount: number; }
) => {
    const { activeColor, qt6Sensitivity, qt6BarCount } = settings;
    ctx.lineWidth = 2;
    ctx.strokeStyle = activeColor;
    ctx.fillStyle = activeColor;
    ctx.beginPath();

    const bufferLength = data.length;
    const isFloat = data instanceof Float32Array;

    if (type === 'wave') {
        let trigger = 0;
        const searchLimit = Math.floor(bufferLength / 2);
        for (let i = 0; i < searchLimit; i++) {
            const val = isFloat ? (data[i] as number) : ((data[i] as number) - 128) / 128.0;
            const nextVal = isFloat ? (data[i+1] as number) : ((data[i+1] as number) - 128) / 128.0;
            if (val <= 0 && nextVal > 0) {
                trigger = i;
                break;
            }
        }

        const windowSize = Math.floor(bufferLength * 0.5); 
        const sliceWidth = width / windowSize;
        const baseline = height * 0.5;
        const scale = height * 0.4 * qt6Sensitivity;

        ctx.beginPath();
        for (let i = 0; i < windowSize; i++) {
            const idx = trigger + i;
            if (idx >= bufferLength) break;

            let v = 0;
            if (isFloat) v = data[idx] as number;
            else v = ((data[idx] as number) - 128) / 128.0;
            
            const y = baseline - (v * scale);
            const x = i * sliceWidth;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        
        const grad = ctx.createLinearGradient(width * 0.8, 0, width, 0);
        grad.addColorStop(0, activeColor);
        grad.addColorStop(1, hexToRgba(activeColor, 0));
        ctx.strokeStyle = grad;
        ctx.stroke();
    } else if (type === 'bars') {
        const barCount = qt6BarCount;
        const startBin = 2;
        const usefulLimit = Math.min(bufferLength, Math.floor(bufferLength * 0.6));
        const range = usefulLimit - startBin;
        const step = Math.max(1, Math.floor(range / barCount));
        
        const barWidth = (width / barCount) * 0.8;
        const gap = (width / barCount) * 0.2;
        
        ctx.fillStyle = activeColor;
        
        for(let i = 0; i < barCount; i++) {
            let sum = 0;
            let count = 0;
            for(let j = 0; j < step; j++) {
                const idx = startBin + i * step + j;
                if(idx < usefulLimit) {
                    sum += (data[idx] as number);
                    count++;
                }
            }
            const avg = count > 0 ? sum / count : 0;
            const val = (avg / 255.0) * qt6Sensitivity;
            const barHeight = Math.max(2, val * (height * 0.5));
            
            const x = i * (barWidth + gap) + (gap / 2);
            const y = height * 0.95 - barHeight;
            
            ctx.beginPath();
            if (ctx.roundRect) {
                    ctx.roundRect(x, y, barWidth, barHeight, 4);
            } else {
                    ctx.rect(x, y, barWidth, barHeight);
            }
            ctx.fill();
        }
    } else if (type === 'circle') {
        const centerX = width / 2;
        const centerY = height / 2;
        const baseRadius = Math.min(width, height) * 0.20;
        const maxExtrude = Math.min(width, height) * 0.25;
        
        let bassSum = 0;
        for(let k=2; k<12; k++) bassSum += (data[k] as number);
        const bassEnergy = (bassSum / 10 / 255.0) * qt6Sensitivity;
        const currentRadius = baseRadius + (bassEnergy * 20);

        const totalBars = 64; 
        const halfBars = totalBars / 2;
        const startBin = 2;
        const usefulLimit = Math.floor(bufferLength * 0.5);
        const step = Math.floor((usefulLimit - startBin) / halfBars);

        ctx.lineCap = 'round';
        ctx.lineWidth = 4;

        for(let i = 0; i < halfBars; i++) {
            let sum = 0;
            for(let j=0; j<step; j++) {
                    const idx = startBin + i*step + j;
                    if(idx < usefulLimit) sum += (data[idx] as number);
            }
            const avg = sum/step;
            const val = (avg / 255.0) * qt6Sensitivity;
            
            const barH = Math.max(4, Math.pow(val, 2) * maxExtrude);
            const angleStep = Math.PI / halfBars;
            const angleOffset = i * angleStep;
            const angleR = -Math.PI/2 + angleOffset;
            const angleL = -Math.PI/2 - angleOffset;

            drawRadialBar(ctx, centerX, centerY, currentRadius, barH, angleR);
            if (i > 0) {
                drawRadialBar(ctx, centerX, centerY, currentRadius, barH, angleL);
            }
        }
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, currentRadius - 5, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(activeColor, 0.1 + (bassEnergy * 0.2));
        ctx.fill();
        ctx.strokeStyle = hexToRgba(activeColor, 0.5);
        ctx.lineWidth = 2;
        ctx.stroke();
    } else if (type === 'circular-wave') {
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.2;
        const maxAmp = Math.min(width, height) * 0.25;

        let energy = 0;
        const usefulLimit = Math.floor(bufferLength * 0.35); 
        
        for(let i=2; i<20; i++) energy += (data[i] as number);
        const pulse = (energy / 18 / 255.0) * 15 * qt6Sensitivity;

        const numPoints = 120;
        const wavePoints: {x: number, y: number}[] = [];

        for (let i = 0; i < numPoints; i++) {
            const relativeIdx = i < (numPoints / 2) 
                ? i / (numPoints / 2) 
                : (numPoints - i) / (numPoints / 2);
            
            const mappedIdx = Math.floor(Math.pow(relativeIdx, 1.2) * (usefulLimit - 2)) + 2;
            
            let sum = 0;
            let count = 0;
            for(let w = -1; w <= 1; w++) {
                const idx = mappedIdx + w;
                if(idx >= 0 && idx < usefulLimit) {
                    sum += (data[idx] as number);
                    count++;
                }
            }
            const val = count > 0 ? sum / count : 0;
            const scaledVal = Math.pow(val / 255.0, 1.5); 
            const offset = scaledVal * maxAmp * qt6Sensitivity;
            const r = radius + pulse + offset;
            
            const angle = (Math.PI * 2 * i) / numPoints - (Math.PI / 2);
            
            wavePoints.push({
                x: centerX + Math.cos(angle) * r,
                y: centerY + Math.sin(angle) * r
            });
        }

        ctx.beginPath();
        if (wavePoints.length > 0) {
            const last = wavePoints[wavePoints.length - 1];
            const first = wavePoints[0];
            const midX = (last.x + first.x) / 2;
            const midY = (last.y + first.y) / 2;
            
            ctx.moveTo(midX, midY);

            for (let i = 0; i < wavePoints.length; i++) {
                const p = wavePoints[i];
                const nextP = wavePoints[(i + 1) % wavePoints.length];
                const midNextX = (p.x + nextP.x) / 2;
                const midNextY = (p.y + nextP.y) / 2;
                ctx.quadraticCurveTo(p.x, p.y, midNextX, midNextY);
            }
        }
        
        ctx.closePath();
        ctx.lineWidth = 3;
        ctx.strokeStyle = activeColor;
        ctx.stroke();
        
        const grad = ctx.createRadialGradient(centerX, centerY, radius * 0.5, centerX, centerY, radius + maxAmp);
        grad.addColorStop(0, hexToRgba(activeColor, 0.05));
        grad.addColorStop(1, hexToRgba(activeColor, 0.25));
        ctx.fillStyle = grad;
        ctx.fill();
    }
};

export const drawScrollingLyrics = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    lines: AlignedWord[][],
    currentLineRef: { current: number },
    settings: {
        fontFamily: string;
        activeColor: string;
        inactiveColor: string;
        inactiveOpacity: number;
        smoothingFactor: number;
        verticalOffset: number;
        aspectRatio: string;
    }
) => {
    if (lines.length === 0) return;
    
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    let activeLineIdx = lines.findIndex(line => {
        if (line.length === 0) return false;
        const start = line[0].start_s;
        const end = line[line.length - 1].end_s;
        return time >= start && time <= end;
    });

    if (activeLineIdx === -1) {
        const upcomingIdx = lines.findIndex(line => line.length > 0 && line[0].start_s > time);
        if (upcomingIdx !== -1) {
            const timeToStart = lines[upcomingIdx][0].start_s - time;
            if (upcomingIdx === 0 && timeToStart > 4) {
                    activeLineIdx = -1;
            } else {
                    activeLineIdx = upcomingIdx;
            }
        } else {
            activeLineIdx = lines.length - 1;
        }
    }
    
    if (activeLineIdx !== -1) {
        const diff = activeLineIdx - currentLineRef.current;
        if (Math.abs(diff) > 4) {
            currentLineRef.current = activeLineIdx;
        } else {
            const factor = settings.smoothingFactor;
            currentLineRef.current += diff * factor;
        }
    }

    const renderCenterIdx = currentLineRef.current;
    const baseIdx = Math.floor(renderCenterIdx);
    const PADDING = settings.aspectRatio === "9:16" ? 60 : 40;
    const centerY = (height / 2) + (height * settings.verticalOffset);

    const getLayout = (idx: number, scale: number) => {
        if (idx < 0 || idx >= lines.length) return null;
        const line = lines[idx];
        if (line.length === 0) return null;

        let fontSize = 48 * scale;
        if (settings.aspectRatio === "9:16") fontSize = 36 * scale; 
        
        ctx.font = `bold ${fontSize}px ${settings.fontFamily}`;
        const lineHeight = fontSize * 1.3;
        const maxW = width * 0.85;

        const wordsWithWidths = line.map(w => ({
            ...w,
            width: ctx.measureText(w.word + " ").width
        }));

        const rows: { words: typeof wordsWithWidths, width: number }[] = [];
        let currentRow: typeof wordsWithWidths = [];
        let currentWidth = 0;

        wordsWithWidths.forEach(w => {
            if (currentWidth + w.width > maxW && currentRow.length > 0) {
                rows.push({ words: currentRow, width: currentWidth });
                currentRow = [w];
                currentWidth = w.width;
            } else {
                currentRow.push(w);
                currentWidth += w.width;
            }
        });
        if (currentRow.length > 0) {
            rows.push({ words: currentRow, width: currentWidth });
        }
        return { rows, totalHeight: rows.length * lineHeight, lineHeight, fontSize };
    };

    const visibleLines = [];
    for (let i = baseIdx - 2; i <= baseIdx + 3; i++) {
        if (i >= 0 && i < lines.length) {
            const dist = Math.abs(i - renderCenterIdx);
            const scale = Math.max(0.6, 1.2 - (dist * 0.3)); 
            const opacity = Math.max(0.1, 1 - (dist * 0.5));
            
            const layout = getLayout(i, scale);
            if (layout) {
                visibleLines.push({ index: i, layout, scale, opacity });
            }
        }
    }

    const fractional = renderCenterIdx - baseIdx;
    const baseLayoutRef = getLayout(baseIdx, 1.0); 
    const nextLayoutRef = getLayout(baseIdx + 1, 1.0);
    
    const baseH = baseLayoutRef ? baseLayoutRef.totalHeight : 60;
    const nextH = nextLayoutRef ? nextLayoutRef.totalHeight : 60;
    
    const scrollDist = (baseH / 2) + PADDING + (nextH / 2);
    const pixelOffset = fractional * scrollDist;

    visibleLines.forEach(item => {
        const relIndex = item.index - baseIdx; 
        let yOffset = 0;
        
        if (relIndex === 0) {
            yOffset = 0;
        } else if (relIndex > 0) {
            let hSum = baseH / 2 + PADDING; 
            for (let k = baseIdx + 1; k < item.index; k++) {
                    const l = getLayout(k, 1.0);
                    hSum += (l ? l.totalHeight : 60) + PADDING;
            }
            const l = getLayout(item.index, 1.0);
            hSum += (l ? l.totalHeight : 60) / 2;
            yOffset = hSum;
        } else {
            let hSum = baseH / 2 + PADDING;
            for (let k = baseIdx - 1; k > item.index; k--) {
                const l = getLayout(k, 1.0);
                hSum += (l ? l.totalHeight : 60) + PADDING;
            }
            const l = getLayout(item.index, 1.0);
            hSum += (l ? l.totalHeight : 60) / 2;
            yOffset = -hSum;
        }

        const drawY = centerY - pixelOffset + yOffset;
        
        ctx.font = `bold ${item.layout.fontSize}px ${settings.fontFamily}`;
        const startTextY = drawY - ((item.layout.rows.length - 1) * item.layout.lineHeight) / 2;

        item.layout.rows.forEach((row: any, rowIdx: number) => {
            const rowY = startTextY + (rowIdx * item.layout.lineHeight);
            let currentX = (width - row.width) / 2;

            row.words.forEach((w: any) => {
                const isWordActive = time >= w.start_s && time <= w.end_s;
                const isWordPast = time > w.end_s;
                const isLineActive = item.index === activeLineIdx;

                if (isLineActive) {
                    if (isWordActive) {
                        ctx.fillStyle = settings.activeColor;
                        ctx.shadowColor = settings.activeColor; 
                        ctx.shadowBlur = 25;
                    } else if (isWordPast) {
                        ctx.fillStyle = hexToRgba(settings.inactiveColor, 0.9);
                        ctx.shadowBlur = 0;
                    } else {
                        ctx.fillStyle = hexToRgba(settings.inactiveColor, settings.inactiveOpacity);
                        ctx.shadowBlur = 0;
                    }
                } else {
                    ctx.fillStyle = hexToRgba(settings.inactiveColor, item.opacity * settings.inactiveOpacity);
                    ctx.shadowBlur = 0;
                }

                ctx.textAlign = 'left';
                ctx.fillText(w.word, currentX, rowY);
                currentX += w.width;
            });
        });
        ctx.shadowBlur = 0;
    });
};

export const STOP_WORDS = new Set(['the', 'and', 'a', 'to', 'of', 'in', 'it', 'is', 'that', 'you', 'he', 'she', 'was', 'for', 'on', 'are', 'as', 'with', 'his', 'they', 'at', 'be', 'this', 'have', 'from', 'or', 'one', 'had', 'by', 'word', 'but', 'not', 'what', 'all', 'were', 'we', 'when', 'your', 'can', 'said', 'there', 'use', 'an', 'each', 'which', 'she', 'do', 'how', 'their', 'if', 'will', 'up', 'other', 'about', 'out', 'many', 'then', 'them', 'these', 'so', 'some', 'her', 'would', 'make', 'like', 'him', 'into', 'time', 'has', 'look', 'two', 'more', 'write', 'go', 'see', 'number', 'no', 'way', 'could', 'people', 'my', 'than', 'first', 'water', 'been', 'call', 'who', 'oil', 'its', 'now', 'find']);

export const getCleanAlignedWords = (aligned: AlignedWord[]): AlignedWord[] => {
    const clean: AlignedWord[] = [];
    let bracketDepth = 0;
    for (const w of aligned) {
        const originalWord = w.word;
        let cleanWordBuilder = "";
        for (let i = 0; i < originalWord.length; i++) {
            const char = originalWord[i];
            if (char === '[') { bracketDepth++; continue; }
            if (char === ']') { if (bracketDepth > 0) bracketDepth--; continue; }
            if (bracketDepth === 0) cleanWordBuilder += char;
        }
        const trimmed = cleanWordBuilder.trim();
        if (trimmed.length > 0) {
            clean.push({ ...w, word: trimmed });
        }
    }
    if (clean.length === 0) return [];
    const fixed: AlignedWord[] = [];
    let current = clean[0];
    for (let i = 1; i < clean.length; i++) {
            const next = clean[i];
            const currText = current.word.trim();
            const nextText = next.word.trim();
            const isFragment = /['’]$/.test(currText) || /^['’]/.test(nextText) || /^['’]+$/.test(currText) || /^['’]+$/.test(nextText);
            const gap = next.start_s - current.end_s;
            if (isFragment && gap < 0.5) {
                current = { ...current, word: currText + nextText, end_s: next.end_s };
            } else {
                fixed.push(current);
                current = next;
            }
    }
    fixed.push(current);
    return fixed;
};

export const stripMetaTags = (text: string): string => {
    if (!text) return "";
    let clean = text
        .replace(/\[[\s\S]*?\]/g, '') // Remove [tags]
        .replace(/\{[\s\S]*?\}/g, ''); // Remove {tags}
    
    const lines = clean.split('\n').map(line => line.trim());
    const resultLines: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.length > 0) {
            resultLines.push(line);
        } else {
            // Keep empty line if it acts as a separator (max 1 consecutive empty line)
            if (resultLines.length > 0 && resultLines[resultLines.length - 1] !== "") {
                resultLines.push("");
            }
        }
    }
    
    // If the last line is empty, remove it
    if (resultLines.length > 0 && resultLines[resultLines.length - 1] === "") {
        resultLines.pop();
    }
    
    return resultLines.join('\n');
};

export const cleanStringForMatch = (s: string) => {
    if (!s) return "";
    try {
        return s.toLowerCase().replace(/['’]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
    } catch (e) {
        return s.toLowerCase().replace(/['".,/#!$%^&*;:{}=\-_`~()]/g, "");
    }
};

export const groupWordsByTiming = (aligned: AlignedWord[]): AlignedWord[][] => {
    const cleanAligned = getCleanAlignedWords(aligned); 
    if (cleanAligned.length === 0) return [];
    const groups: AlignedWord[][] = [];
    let currentLine: AlignedWord[] = [];
    const GAP_THRESHOLD = 0.5;
    const MAX_CHARS = 40; 
    cleanAligned.forEach((word, idx) => {
        if (idx === 0) { currentLine.push(word); return; }
        const prevWord = cleanAligned[idx - 1];
        const timeGap = word.start_s - prevWord.end_s;
        const currentLen = currentLine.reduce((sum, w) => sum + w.word.length + 1, 0);
        const isGapBig = timeGap > GAP_THRESHOLD;
        const isLineLong = currentLen > MAX_CHARS;
        const endsClause = /[.,;!?]$/.test(prevWord.word);
        if (isGapBig || ((isLineLong || endsClause) && timeGap > 0.15)) {
            groups.push(currentLine);
            currentLine = [word];
        } else {
            currentLine.push(word);
        }
    });
    if (currentLine.length > 0) groups.push(currentLine);
    return groups;
};

export const matchWordsToPrompt = (aligned: AlignedWord[], promptText: string): AlignedWord[][] => {
    const cleanAligned = getCleanAlignedWords(aligned);
    if (cleanAligned.length === 0) return [];
    const promptLines = stripMetaTags(promptText).split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (promptLines.length === 0) return groupWordsByTiming(cleanAligned);
    type PromptToken = { text: string; lineIndex: number; isLineStart: boolean };
    const tokens: PromptToken[] = [];
    promptLines.forEach((line, idx) => {
        const words = line.split(/\s+/).map(cleanStringForMatch).filter(w => w.length > 0);
        words.forEach((w, wIdx) => tokens.push({ text: w, lineIndex: idx, isLineStart: wIdx === 0 }));
    });
    const groups: AlignedWord[][] = [];
    let currentGroup: AlignedWord[] = [];
    let currentLineIndex = 0;
    let tokenPtr = 0;
    let wordsSinceLastMatch = 0; 
    for (let i = 0; i < cleanAligned.length; i++) {
        const wordObj = cleanAligned[i];
        const cleanWord = cleanStringForMatch(wordObj.word);
        if (!cleanWord) { currentGroup.push(wordObj); continue; }
        let bestMatchOffset = -1;
        const isLost = wordsSinceLastMatch > 4; 
        const MAX_LOOKAHEAD = isLost ? 1000 : 200; 
        const searchLimit = Math.min(tokens.length - tokenPtr, MAX_LOOKAHEAD);
        for (let lookahead = 0; lookahead < searchLimit; lookahead++) {
            const target = tokens[tokenPtr + lookahead];
            const isMatch = target.text === cleanWord || (!isLost && (target.text.includes(cleanWord) || cleanWord.includes(target.text)));
            if (isMatch) {
                let contextMatch = false;
                if (i + 1 < cleanAligned.length) {
                    const nextAudio = cleanStringForMatch(cleanAligned[i+1].word);
                    if (nextAudio) {
                            for (let offset = 1; offset <= 3; offset++) {
                                if (tokenPtr + lookahead + offset < tokens.length) {
                                    const nextToken = tokens[tokenPtr + lookahead + offset].text;
                                    if (nextToken === nextAudio || nextToken.includes(nextAudio) || nextAudio.includes(nextToken)) { contextMatch = true; break; }
                                }
                            }
                    } else { contextMatch = true; }
                }
                if (lookahead < 3 || contextMatch) { bestMatchOffset = lookahead; break; }
                if (isLost && !STOP_WORDS.has(cleanWord) && target.text === cleanWord) {
                        if (target.isLineStart || lookahead < 20) { bestMatchOffset = lookahead; break; }
                }
            }
        }
        if (bestMatchOffset !== -1) {
            const target = tokens[tokenPtr + bestMatchOffset];
            if (target.lineIndex > currentLineIndex) { if (currentGroup.length > 0) groups.push(currentGroup); currentGroup = []; currentLineIndex = target.lineIndex; }
            tokenPtr += bestMatchOffset + 1;
            wordsSinceLastMatch = 0; 
        } else { wordsSinceLastMatch++; }
        currentGroup.push(wordObj);
    }
    if (currentGroup.length > 0) groups.push(currentGroup);
    return groups;
};

/**
 * Uses Gemini to group a flat list of aligned words into logical lines 
 * based on the provided lyrics text structure.
 */
export const groupLyricsByLines = async (
  lyrics: string,
  aligned: AlignedWord[],
  apiKey?: string,
  modelName: string = "gemini-3-flash-preview",
  fallback?: AlignedWord[][]
): Promise<AlignedWord[][]> => {
  const key = apiKey || process.env.API_KEY;
  if (!key) return fallback || [];

  const ai = new GoogleGenAI({ apiKey: key });

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: `
        Task: Group a list of synchronized words into arrays that represent lines of a song.
        Use the LYRICS provided as the ground truth for line breaks.
        
        LYRICS:
        ${lyrics}

        SYNCED WORDS (JSON):
        ${JSON.stringify(aligned.map(w => ({ word: w.word, start: w.start_s, end: w.end_s })))}
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING, description: "The word text" },
                start: { type: Type.NUMBER, description: "Start time in seconds" },
                end: { type: Type.NUMBER, description: "End time in seconds" }
              },
              required: ["word", "start", "end"]
            }
          }
        }
      }
    });

    const data = JSON.parse(response.text || "[]");
    return data.map((line: any[]) => line.map((item: any) => ({
      word: item.word,
      start_s: item.start,
      end_s: item.end,
      success: true,
      p_align: 1.0
    })));
  } catch (error) {
    console.error("Gemini Grouping Error:", error);
    return fallback || [];
  }
};
