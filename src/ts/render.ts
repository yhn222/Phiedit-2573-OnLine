import { BPM, ChartData, RGBcolor, NoteType, Ctx } from "./typeDefinitions";
import easingFuncs from "./easing";
import { getBeatsValue, moveAndRotate, convertDegreesToRadians, getContext, convertXToCanvas, convertYToCanvas } from "./tools";
import { TaskQueue } from "./classes/taskQueue";
import { NumberEvent, ColorEvent, TextEvent, BaseEvent } from "./classes/event";
import { Chart } from "./classes/chart";
import { Note } from "./classes/note";
export default function renderChart(canvas: HTMLCanvasElement, chartData: ChartData, seconds: number) {
    const { chartPackage } = chartData;
    const { chart, background } = chartPackage;
    const ctx = getContext(canvas);
    seconds -= chart.META.offset / 1000;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground(canvas, chartData, background);
    drawJudgeLines(ctx, chartData, seconds);
    chart.highlightNotes();
    drawNotes(ctx, chartData, seconds);
}
function drawBackground(canvas: HTMLCanvasElement, chartData: ChartData, background: HTMLImageElement) {
    const ctx = getContext(canvas);
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const imageWidth = background.width;
    const imageHeight = background.height;
    const scaleX = canvasWidth / imageWidth;
    const scaleY = canvasHeight / imageHeight;
    const scale = Math.max(scaleX, scaleY);
    const cropWidth = canvasWidth / scale;
    const cropHeight = canvasHeight / scale;
    let cropX = 0;
    let cropY = 0;
    if (scale == scaleX) {
        cropY = (imageHeight - cropHeight) / 2;
    } else {
        cropX = (imageWidth - cropWidth) / 2;
    }
    ctx.resetTransform();
    ctx.globalAlpha = 1;
    ctx.drawImage(
        background,
        cropX, cropY, cropWidth, cropHeight,
        0, 0, canvasWidth, canvasHeight
    );
    ctx.fillStyle = "#000";
    ctx.globalAlpha = chartData.backgroundDarkness;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}
function drawJudgeLines(ctx: Ctx, chartData: ChartData, seconds: number) {
    const { chartPackage } = chartData;
    const { chart, textures } = chartPackage;
    chart.judgeLineList.sort((y, x) => x.zOrder - y.zOrder);
    for (let i = 0; i < chart.judgeLineList.length; i++) {
        const { x, y, angle, alpha, scaleX, scaleY, color, text } = getJudgeLineInfo(chart, i, seconds, {
            getX: true,
            getY: true,
            getAngle: true,
            getAlpha: true,
            getScaleX: true,
            getScaleY: true,
            getColor: true,
            getText: true
        });
        const judgeLine = chart.judgeLineList[i];
        if (alpha <= 0.01) continue;
        const radians = convertDegreesToRadians(angle);
        ctx.translate(convertXToCanvas(x), convertYToCanvas(y));
        ctx.rotate(radians);
        ctx.scale(scaleX, scaleY);
        ctx.globalAlpha = alpha / 255;
        if (judgeLine.Texture in textures) {
            const image = textures[judgeLine.Texture];
            ctx.drawImage(image, 0, 0, image.width, image.height, -image.width / 2, -image.height / 2, image.width, image.height);
        }
        else if (text == undefined) {
            ctx.strokeStyle = "rgb(" + color[0] + ", " + color[1] + ", " + color[2] + ")";
            ctx.lineWidth = chartData.lineWidth;
            ctx.beginPath();
            ctx.moveTo(-chartData.lineLength, 0);
            ctx.lineTo(chartData.lineLength, 0);
            ctx.stroke();
        }
        else {
            ctx.fillStyle = "rgb(" + color[0] + ", " + color[1] + ", " + color[2] + ")";
            ctx.font = chartData.textSize + "px PhiFont";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, 0, 0);
        }
        ctx.resetTransform();
    }
}
function getJudgeLineInfo(chart: Chart, lineNumber: number, seconds: number, {
    getX = false, getY = false, getAngle = false, getAlpha = false, getSpeed = false,
    getScaleX = false, getScaleY = false, getColor = false, getPaint = false, getText = false
} = {
        getX: true, getY: true, getAngle: true, getAlpha: true, getSpeed: true,
        getScaleX: true, getScaleY: true, getColor: true, getPaint: true, getText: true
    }, visited: Record<number, boolean> = {}) {
    if (visited[lineNumber]) {
        throw new Error("Circular inheriting");
    }
    visited[lineNumber] = true;
    const judgeLine = chart.judgeLineList[lineNumber];
    let x = 0, y = 0, angle = 0, alpha = 0, speed = 0;
    for (const layer of judgeLine.eventLayers) {
        if (getX) x += interpolateNumberEventValue(chart.BPMList, findLastEvent(chart.BPMList, layer.moveXEvents, seconds), seconds);
        if (getY) y += interpolateNumberEventValue(chart.BPMList, findLastEvent(chart.BPMList, layer.moveYEvents, seconds), seconds);
        if (getAngle) angle += interpolateNumberEventValue(chart.BPMList, findLastEvent(chart.BPMList, layer.rotateEvents, seconds), seconds);
        if (getAlpha) alpha += interpolateNumberEventValue(chart.BPMList, findLastEvent(chart.BPMList, layer.alphaEvents, seconds), seconds);
        if (getSpeed) speed += interpolateNumberEventValue(chart.BPMList, findLastEvent(chart.BPMList, layer.speedEvents, seconds), seconds);
    }
    if (judgeLine.father >= 0 && judgeLine.father < chart.judgeLineList.length) {
        const { x: fatherX, y: fatherY, angle: fatherAngle } = getJudgeLineInfo(chart, judgeLine.father, seconds, {
            getX: true,
            getY: true,
            getAngle: true
        }, visited);
        const { x: newX, y: newY } = moveAndRotate(fatherX, fatherY, fatherAngle, x, y);
        const newAngle = angle;
        x = newX;
        y = newY;
        angle = newAngle;
    }
    const scaleX = getScaleX ? interpolateNumberEventValue(chart.BPMList, findLastEvent(chart.BPMList, judgeLine.extended.scaleXEvents, seconds), seconds) || 1 : 1;
    const scaleY = getScaleY ? interpolateNumberEventValue(chart.BPMList, findLastEvent(chart.BPMList, judgeLine.extended.scaleYEvents, seconds), seconds) || 1 : 1;
    const color = getColor ? interpolateColorEventValue(chart.BPMList, findLastEvent(chart.BPMList, judgeLine.extended.colorEvents, seconds), seconds) : [255, 255, 255] as RGBcolor;
    const paint = getPaint ? interpolateNumberEventValue(chart.BPMList, findLastEvent(chart.BPMList, judgeLine.extended.paintEvents, seconds), seconds) : 0;
    const text = getText ? interpolateTextEventValue(chart.BPMList, findLastEvent(chart.BPMList, judgeLine.extended.textEvents, seconds), seconds) : '';
    return { x, y, angle, alpha, speed, scaleX, scaleY, color, paint, text };
}
function interpolateNumberEventValue(BPMList: BPM[], event: NumberEvent | null, seconds: number) {
    const { startSeconds = 0, endSeconds = 0 } = event?.caculateSeconds(BPMList) ?? {};
    const { start = 0, end = 0, easingType = 1, easingLeft = 0, easingRight = 1 } = event ?? {};
    if (endSeconds <= seconds) {
        return end;
    } else {
        const dx = endSeconds - startSeconds;
        const dy = end - start;
        const sx = seconds - startSeconds;
        const easingFunction = easingFuncs[easingType];
        const easingFactor = easingFunction(sx / dx * (easingRight - easingLeft) + easingLeft);
        return start + easingFactor * dy;
    }
}
function interpolateColorEventValue(BPMList: BPM[], event: ColorEvent | null, seconds: number) {
    const { startSeconds = 0, endSeconds = 0 } = event?.caculateSeconds(BPMList) ?? {};
    const { start = [255, 255, 255], end = [255, 255, 255], easingType = 1, easingLeft = 0, easingRight = 1 } = event ?? {};
    if (endSeconds <= seconds) {
        return end;
    } else {
        const color: RGBcolor = [255, 255, 255];
        for (let i = 0; i < 3; i++) {
            const dx = endSeconds - startSeconds;
            const dy = end[i] - start[i];
            const sx = seconds - startSeconds;
            const easingFunction = easingFuncs[easingType];
            const easingFactor = easingFunction(sx / dx * (easingRight - easingLeft) + easingLeft);
            color[i] = start[i] + easingFactor * dy;
        }
        return color;
    }
}
function interpolateTextEventValue(BPMList: BPM[], event: TextEvent | null, seconds: number) {
    const { /*startSeconds = 0,*/ endSeconds = 0 } = event?.caculateSeconds(BPMList) ?? {};
    const { start = undefined, end = undefined/*, easingType = 1, easingLeft = 0, easingRight = 1*/ } = event ?? {};
    if (endSeconds <= seconds) {
        return end;
    } else {
        if (start == undefined || end == undefined || event == null) return undefined;
        if (start.startsWith(end) || end.startsWith(start)) {
            const lengthStart = start.length;
            const lengthEnd = end.length;
            const e = new NumberEvent({
                startTime: event.startTime,
                endTime: event.endTime,
                easingType: event.easingType,
                easingLeft: event.easingLeft,
                easingRight: event.easingRight,
                bezier: event.bezier,
                bezierPoints: event.bezierPoints,
                start: lengthStart,
                end: lengthEnd
            });
            const length = Math.round(interpolateNumberEventValue(BPMList, e, seconds));
            return start.length > end.length ? start.slice(0, length) : end.slice(0, length);
        }
        return start;
    }
}

function findLastEvent<T extends BaseEvent<unknown>>(BPMList: BPM[], events: T[], seconds: number): T | null {
    let lastEvent: T | null = null;
    let smallestDifference = Infinity;
    events.forEach(event => {
        const { startSeconds } = event.caculateSeconds(BPMList);
        if (startSeconds <= seconds) {
            const difference = seconds - startSeconds;
            if (difference < smallestDifference) {
                smallestDifference = difference;
                lastEvent = event;
            }
        }
    });
    return lastEvent;
}
function drawNotes(ctx: Ctx, chartData: ChartData, seconds: number) {
    const { chartPackage, resourcePackage } = chartData;
    const { chart } = chartPackage;
    const taskQueue = new TaskQueue<void>();
    for (let judgeLineNumber = 0; judgeLineNumber < chart.judgeLineList.length; judgeLineNumber++) {
        const judgeLine = chart.judgeLineList[judgeLineNumber];
        const judgeLineInfo = getJudgeLineInfo(chart, judgeLineNumber, seconds, {
            getX: true,
            getY: true,
            getAngle: true,
            getAlpha: true
        });
        for (let noteNumber = 0; noteNumber < judgeLine.notes.length; noteNumber++) {
            const note = judgeLine.notes[noteNumber];
            const noteInfo = getNoteInfo(chartData, judgeLineNumber, noteNumber, seconds, judgeLineInfo);
            const radians = convertDegreesToRadians(noteInfo.angle);
            const missSeconds = note.type == NoteType.Tap ? Note.TAP_BAD : note.type == NoteType.Hold ? Note.HOLD_BAD : Note.DRAGFLICK_PERFECT;
            if (seconds >= noteInfo.startSeconds && note.hitSeconds == undefined && !note.isFake) {
                note.hitSeconds = seconds;
                note.playSound(resourcePackage);
            }
            if (note.hitSeconds && seconds < note.hitSeconds) {
                note.hitSeconds = undefined;
            }
            if (note.hitSeconds == undefined && !note.isFake && seconds > noteInfo.startSeconds + missSeconds) {
                console.log("missed note: ", note);
            }
            if (!note.isFake && note.hitSeconds && seconds < (() => {
                if (note.type == NoteType.Hold)
                    return Math.floor((noteInfo.endSeconds - note.hitSeconds) / resourcePackage.hitFxFrequency)
                        * resourcePackage.hitFxFrequency + note.hitSeconds;
                else
                    return noteInfo.endSeconds;
            })() + resourcePackage.hitFxDuration) {
                const hitSeconds = note.hitSeconds;
                taskQueue.addTask(() => {
                    ctx.globalAlpha = 1;
                    const { x, y, angle } = getJudgeLineInfo(chart, judgeLineNumber, hitSeconds, {
                        getX: true,
                        getY: true,
                        getAngle: true
                    });
                    function _showPerfectHitFx(frameNumber: number, x: number, y: number, angle: number) {
                        const frame = resourcePackage.perfectHitFxFrames[frameNumber];
                        const noteHittedPosition = moveAndRotate(x, y, angle, note.positionX, note.yOffset);
                        const canvasX = convertXToCanvas(noteHittedPosition.x);
                        const canvasY = convertYToCanvas(noteHittedPosition.y);
                        const radians = convertDegreesToRadians(angle);
                        ctx.translate(canvasX, canvasY);
                        if (chartData.resourcePackage.hitFxRotate) ctx.rotate(radians);
                        ctx.drawImage(frame, -frame.width / 2, -frame.height / 2);
                        ctx.resetTransform();
                    }
                    function _showGoodHitFx(frameNumber: number, x: number, y: number, angle: number) {
                        const frame = resourcePackage.goodHitFxFrames[frameNumber];
                        const noteHittedPosition = moveAndRotate(x, y, angle, note.positionX, note.yOffset);
                        const canvasX = convertXToCanvas(noteHittedPosition.x);
                        const canvasY = convertYToCanvas(noteHittedPosition.y);
                        const radians = convertDegreesToRadians(angle);
                        ctx.translate(canvasX, canvasY);
                        if (chartData.resourcePackage.hitFxRotate) ctx.rotate(radians);
                        ctx.drawImage(frame, -frame.width / 2, -frame.height / 2);
                        ctx.resetTransform();
                    }
                    if (note.getJudgement(chart.BPMList) == 'perfect') {
                        if (note.type == NoteType.Hold) {
                            for (let s = hitSeconds; s <= seconds && s < noteInfo.endSeconds; s += resourcePackage.hitFxFrequency) {
                                const { x, y, angle } = getJudgeLineInfo(chart, judgeLineNumber, s, {
                                    getX: true,
                                    getY: true,
                                    getAngle: true
                                });
                                const frameNumber = Math.floor(
                                    (seconds - s)
                                    / chartData.resourcePackage.hitFxDuration
                                    * chartData.resourcePackage.perfectHitFxFrames.length
                                );
                                if (frameNumber < chartData.resourcePackage.perfectHitFxFrames.length)
                                    _showPerfectHitFx(frameNumber, x, y, angle);
                            }
                        }
                        else {
                            const frameNumber = Math.floor(
                                (seconds - hitSeconds)
                                / chartData.resourcePackage.hitFxDuration
                                * chartData.resourcePackage.perfectHitFxFrames.length
                            )
                            _showPerfectHitFx(frameNumber, x, y, angle);
                        }
                    }
                    if (note.getJudgement(chart.BPMList) == 'good') {
                        if (note.type == NoteType.Hold) {
                            for (let s = hitSeconds; s <= seconds && s < noteInfo.endSeconds; s += resourcePackage.hitFxFrequency) {
                                const { x, y, angle } = getJudgeLineInfo(chart, judgeLineNumber, s, {
                                    getX: true,
                                    getY: true,
                                    getAngle: true
                                });
                                const frameNumber = Math.floor(
                                    (seconds - s)
                                    / chartData.resourcePackage.hitFxDuration
                                    * chartData.resourcePackage.goodHitFxFrames.length
                                );
                                if (frameNumber < chartData.resourcePackage.goodHitFxFrames.length)
                                    _showGoodHitFx(frameNumber, x, y, angle);
                            }
                        }
                        else {
                            const frameNumber = Math.floor(
                                (seconds - hitSeconds)
                                / chartData.resourcePackage.hitFxDuration
                                * chartData.resourcePackage.goodHitFxFrames.length
                            )
                            _showGoodHitFx(frameNumber, x, y, angle);
                        }
                    }
                }, 5);
            }
            if (seconds >= noteInfo.endSeconds && note.hitSeconds) continue; // 已经打了
            if (noteInfo.isCovered) continue; // note在线下面
            if (noteInfo.startSeconds - seconds > note.visibleTime) continue; // note不在可见时间内
            if (judgeLineInfo.alpha < 0) continue; // 线的透明度是负数把note给隐藏了
            if (note.type == NoteType.Hold) {
                if (seconds >= noteInfo.endSeconds) continue;
                taskQueue.addTask(() => {
                    ctx.globalAlpha = note.alpha / 255;
                    //if (miss) ctx.globalAlpha /= 2;
                    const canvasStartX = convertXToCanvas(noteInfo.startX), canvasStartY = convertYToCanvas(noteInfo.startY);
                    const canvasEndX = convertXToCanvas(noteInfo.endX), canvasEndY = convertYToCanvas(noteInfo.endY);
                    const noteWidth = note.highlight ?
                        note.size * 200 * (resourcePackage.holdHLBody.width / resourcePackage.holdBody.width) :
                        note.size * 200;
                    const noteHeight = Math.abs(noteInfo.endPositionY - noteInfo.startPositionY);
                    const holdHead = note.highlight ? resourcePackage.holdHLHead : resourcePackage.holdHead;
                    const holdBody = note.highlight ? resourcePackage.holdHLBody : resourcePackage.holdBody;
                    const holdEnd = note.highlight ? resourcePackage.holdHLEnd : resourcePackage.holdEnd;
                    const noteHeadHeight = holdHead.height / holdBody.width * noteWidth;
                    const noteEndHeight = holdEnd.height / holdBody.width * noteWidth;

                    ctx.translate(canvasStartX, canvasStartY);
                    ctx.rotate(radians);
                    if (noteInfo.endPositionY < noteInfo.startPositionY)
                        ctx.rotate(radians + Math.PI);
                    ctx.drawImage(holdBody,
                        0, 0, holdBody.width, holdBody.height,
                        -noteWidth / 2, -noteHeight, noteWidth, noteHeight);

                    ctx.resetTransform();
                    if (seconds < noteInfo.startSeconds || resourcePackage.holdKeepHead) {
                        ctx.translate(canvasStartX, canvasStartY);
                        ctx.rotate(radians);
                        if (noteInfo.endPositionY < noteInfo.startPositionY)
                            ctx.rotate(Math.PI);
                        ctx.drawImage(holdHead,
                            0, 0, holdHead.width, holdHead.height,
                            -noteWidth / 2, 0, noteWidth, noteHeadHeight);
                    }
                    ctx.resetTransform();

                    ctx.translate(canvasEndX, canvasEndY);
                    ctx.rotate(radians);
                    if (noteInfo.endPositionY < noteInfo.startPositionY)
                        ctx.rotate(Math.PI);
                    ctx.drawImage(holdEnd,
                        0, 0, holdEnd.width, holdEnd.height,
                        -noteWidth / 2, -noteEndHeight, noteWidth, noteEndHeight);
                    ctx.resetTransform();
                }, 1);
            }
            else {
                taskQueue.addTask(() => {
                    ctx.globalAlpha = note.alpha / 255;
                    if (seconds >= noteInfo.startSeconds) {
                        ctx.globalAlpha = Math.max(0, 1 - (seconds - noteInfo.startSeconds) / missSeconds);
                    }
                    const noteImage = (() => {
                        switch (note.type) {
                            case NoteType.Flick:
                                if (note.highlight)
                                    return resourcePackage.flickHL;
                                else
                                    return resourcePackage.flick;
                            case NoteType.Drag:
                                if (note.highlight)
                                    return resourcePackage.dragHL;
                                else
                                    return resourcePackage.drag;
                            default:
                                if (note.highlight)
                                    return resourcePackage.tapHL;
                                else
                                    return resourcePackage.tap;
                        }
                    })();
                    const canvasStartX = convertXToCanvas(noteInfo.startX), canvasStartY = convertYToCanvas(noteInfo.startY);
                    const noteWidth = (() => {
                        let size = note.size * 200;
                        if (note.highlight) {
                            size *= (() => {
                                switch (note.type) {
                                    case NoteType.Drag: return resourcePackage.dragHL.width / resourcePackage.drag.width;
                                    case NoteType.Flick: return resourcePackage.flickHL.width / resourcePackage.flick.width;
                                    default: return resourcePackage.tapHL.width / resourcePackage.tap.width;
                                }
                            })();
                        }
                        return size;
                    })();
                    const noteHeight = noteImage.height / noteImage.width * noteWidth;
                    ctx.translate(canvasStartX, canvasStartY);
                    ctx.rotate(radians);
                    ctx.drawImage(noteImage,
                        0, 0, noteImage.width, noteImage.height,
                        -noteWidth / 2, -noteHeight / 2, noteWidth, noteHeight);
                    ctx.resetTransform();
                }, note.type == NoteType.Drag ? 2 : note.type == NoteType.Tap ? 3 : 4);
            }
        }
    }
    // 叠放顺序从下到上： Hold < Drag < Tap < Flick < 打击特效
    taskQueue.run();
}
function getNoteInfo(chartData: ChartData, lineNumber: number, noteNumber: number, seconds: number, judgeLineInfo: { x: number, y: number, angle: number },) {
    const { chartPackage } = chartData;
    const { chart } = chartPackage;
    const judgeLine = chart.judgeLineList[lineNumber];
    const note = judgeLine.notes[noteNumber];
    const { startSeconds: noteStartSeconds, endSeconds: noteEndSeconds } = note.caculateSeconds(chart.BPMList);
    const { x: lineX, y: lineY, angle: lineAngle } = judgeLineInfo;
    const { positionX, above, speed, yOffset, type } = note;
    let startPositionY = 0, endPositionY = 0;
    for (const eventLayer of judgeLine.eventLayers) {
        const speedEvents = eventLayer.speedEvents.sort((x, y) => getBeatsValue(x.startTime) - getBeatsValue(y.startTime));
        for (let i = 0; i < speedEvents.length; i++) {
            const current = speedEvents[i];
            const next = speedEvents[i + 1];
            const { startSeconds: currentStartSeconds, endSeconds: currentEndSeconds } = current.caculateSeconds(chart.BPMList);
            const currentStart = current.start;
            const currentEnd = current.end;
            const nextStartSeconds = (() => {
                if (i < speedEvents.length - 1)
                    return next.caculateSeconds(chart.BPMList).startSeconds;
                else
                    return Infinity;
            })();
            const
                l1 = Math.min(seconds, noteStartSeconds), l2 = Math.min(seconds, noteEndSeconds),
                r1 = Math.max(seconds, noteStartSeconds), r2 = Math.max(seconds, noteEndSeconds);

            if (currentStartSeconds <= l2 && l2 <= currentEndSeconds && currentEndSeconds <= r2) {
                const h = currentEndSeconds - l2;
                const a = interpolateNumberEventValue(chart.BPMList, current, l2);
                const b = currentEnd;
                endPositionY += (a + b) * h / 2 * chartData.chartSpeed;
            }
            else if (l2 <= currentStartSeconds && currentStartSeconds <= r2 && r2 <= currentEndSeconds) {
                const h = r2 - currentStartSeconds;
                const a = currentStart;
                const b = interpolateNumberEventValue(chart.BPMList, current, r2);
                endPositionY += (a + b) * h / 2 * chartData.chartSpeed;
            }
            else if (l2 <= currentStartSeconds && currentEndSeconds <= r2) {
                const h = currentEndSeconds - currentStartSeconds;
                const a = currentStart;
                const b = currentEnd;
                endPositionY += (a + b) * h / 2 * chartData.chartSpeed;
            }
            else if (currentStartSeconds <= l2 && r2 <= currentEndSeconds) {
                const h = r2 - l2;
                const a = interpolateNumberEventValue(chart.BPMList, current, l2);
                const b = interpolateNumberEventValue(chart.BPMList, current, r2);
                endPositionY += (a + b) * h / 2 * chartData.chartSpeed;
            }

            if (currentEndSeconds <= l2 && l2 <= nextStartSeconds && nextStartSeconds <= r2) {
                const h = nextStartSeconds - l2;
                const a = currentEnd;
                endPositionY += a * h * chartData.chartSpeed;
            }
            else if (l2 <= currentEndSeconds && nextStartSeconds <= r2) {
                const h = nextStartSeconds - currentEndSeconds;
                const a = currentEnd;
                endPositionY += a * h * chartData.chartSpeed;
            }
            else if (l2 <= currentEndSeconds && currentEndSeconds <= r2 && r2 <= nextStartSeconds) {
                const h = r2 - currentEndSeconds;
                const a = currentEnd;
                endPositionY += a * h * chartData.chartSpeed;
            }
            else if (currentEndSeconds <= l2 && r2 <= nextStartSeconds) {
                const h = r2 - l2;
                const a = currentEnd;
                endPositionY += a * h * chartData.chartSpeed;
            }
            if (type == 2 && noteStartSeconds < seconds) {
                continue;
            }
            if (currentStartSeconds <= l1 && l1 <= currentEndSeconds && currentEndSeconds <= r1) {
                const h = currentEndSeconds - l1;
                const a = interpolateNumberEventValue(chart.BPMList, current, l1);
                const b = currentEnd;
                startPositionY += (a + b) * h / 2 * chartData.chartSpeed;
            }
            else if (l1 <= currentStartSeconds && currentStartSeconds <= r1 && r1 <= currentEndSeconds) {
                const h = r1 - currentStartSeconds;
                const a = currentStart;
                const b = interpolateNumberEventValue(chart.BPMList, current, r1);
                startPositionY += (a + b) * h / 2 * chartData.chartSpeed;
            }
            else if (l1 <= currentStartSeconds && currentEndSeconds <= r1) {
                const h = currentEndSeconds - currentStartSeconds;
                const a = currentStart;
                const b = currentEnd;
                startPositionY += (a + b) * h / 2 * chartData.chartSpeed;
            }
            else if (currentStartSeconds <= l1 && r1 <= currentEndSeconds) {
                const h = r1 - l1;
                const a = interpolateNumberEventValue(chart.BPMList, current, l1);
                const b = interpolateNumberEventValue(chart.BPMList, current, r1);
                startPositionY += (a + b) * h / 2 * chartData.chartSpeed;
            }

            if (currentEndSeconds <= l1 && l1 <= nextStartSeconds && nextStartSeconds <= r1) {
                const h = nextStartSeconds - l1;
                const a = currentEnd;
                startPositionY += a * h * chartData.chartSpeed;
            }
            else if (l1 <= currentEndSeconds && nextStartSeconds <= r1) {
                const h = nextStartSeconds - currentEndSeconds;
                const a = currentEnd;
                startPositionY += a * h * chartData.chartSpeed;
            }
            else if (l1 <= currentEndSeconds && currentEndSeconds <= r1 && r1 <= nextStartSeconds) {
                const h = r1 - currentEndSeconds;
                const a = currentEnd;
                startPositionY += a * h * chartData.chartSpeed;
            }
            else if (currentEndSeconds <= l1 && r1 <= nextStartSeconds) {
                const h = r1 - l1;
                const a = currentEnd;
                startPositionY += a * h * chartData.chartSpeed;
            }
        }
    }
    if (seconds >= noteStartSeconds) startPositionY = -startPositionY;// 已经过了那个时间就求相反数
    if (seconds >= noteEndSeconds) endPositionY = -endPositionY;
    const isCovered = endPositionY < 0 && judgeLine.isCover && seconds < noteEndSeconds;
    startPositionY = startPositionY * speed * (above ? 1 : -1) + yOffset;
    endPositionY = endPositionY * speed * (above ? 1 : -1) + yOffset;
    const { x: startX, y: startY } = moveAndRotate(lineX, lineY, lineAngle, positionX, startPositionY);
    const { x: endX, y: endY } = moveAndRotate(lineX, lineY, lineAngle, positionX, endPositionY);
    return {
        startX, startY, endX, endY, angle: lineAngle, startSeconds: noteStartSeconds, endSeconds: noteEndSeconds,
        startPositionY, endPositionY, isCovered
    };
}
