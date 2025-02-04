import { ceil, floor, round } from "lodash";
import { Beats, beatsToSeconds, secondsToBeats } from "./classes/beats";
import { Box } from "./classes/box";
import { RGBAcolor, RGBcolor } from "./classes/color";
import { NumberEvent } from "./classes/event";
import { Note, NoteAbove, NoteType } from "./classes/note";
import eventEmitter from "@/eventEmitter";
import canvasUtils from "./tools/canvasUtils";
import { getContext } from "./tools";
import { ChartPackage } from "./classes/chartPackage";
import { ResourcePackage } from "./classes/resourcePackage";
import { reactive, Ref } from "vue";
export enum CanvasState {
    Playing, Editing
}
export enum RightState {
    Default, Settings, Editing, BPMList, Meta, JudgeLine
}
enum MouseMoveMode {
    None, AddHold, Drag, Select
}
export class Editor {
    readonly chartPackage: ChartPackage
    readonly resourcePackage: ResourcePackage
    canvasRef: Ref<HTMLCanvasElement> | null;
    get canvas(){
        return this.canvasRef?.value ?? null;
    }
    get chart() {
        return this.chartPackage.chart;
    }
    readonly state = reactive({
        /** 主界面（canvas）的状态 */
        canvas: CanvasState.Playing,
        /** 右侧菜单栏的状态 */
        right: RightState.Default
    })
    /** 横线数 */
    horizonalLineCount = 4
    /** 竖线数，包括左右两端的竖线 */
    verticalLineCount = 21
    /** 纵向拉伸（一秒的时间在编辑器时间轴上是多少像素） */
    pxPerSecond = 300
    /** 选中的判定线号 */
    currentJudgeLineNumber = 0
    /** 选中的事件层级编号 */
    currentEventLayerNumber = 0
    /** 选中的所有note和事件 */
    readonly selection: (Note | NumberEvent)[] = reactive([])
    /** 正在放置的note类型 */
    currentNoteType = NoteType.Tap
    /** 鼠标的x坐标 */
    mouseX = 0
    /** 鼠标的y坐标 */
    mouseY = 0
    /** 鼠标移动时做的行为 */
    mouseMoveMode = MouseMoveMode.None
    /** 缓存的碰撞箱 */
    cachedBoxes: Box<Note | NumberEvent>[] = []
    ctx: CanvasRenderingContext2D | null
    get currentJudgeLine() {
        return this.chart.judgeLineList[this.currentJudgeLineNumber];
    }
    get currentEventLayer() {
        return this.currentJudgeLine.eventLayers[this.currentEventLayerNumber];
    }
    readonly lineWidth = 5
    readonly horzionalMainLineColor: RGBAcolor = [255, 255, 255, 0.5]
    readonly horzionalLineColor: RGBAcolor = [255, 255, 255, 0.2]
    readonly verticalMainLineColor: RGBAcolor = [255, 255, 255, 0.5]
    readonly verticalLineColor: RGBAcolor = [255, 255, 255, 0.2]
    readonly borderColor: RGBcolor = [255, 255, 0]
    readonly backgroundColor: RGBcolor = [30, 30, 30]
    readonly selectionColor: RGBcolor = [70, 100, 255]
    readonly mainViewBox = new Box(0, 900, 0, 1350)
    readonly notesViewBox = new Box(0, 900, 50, 650)
    readonly eventsViewBox = new Box(0, 900, 700, 1300)
    readonly eventWidth = 80
    readonly selectPadding = 10
    get verticalLineSpace() {
        return (this.notesViewBox.right - this.notesViewBox.left) / (this.verticalLineCount - 1);
    }
    getPositionYOfSeconds(currentSeconds: number, seconds: number) {
        const offsetY = this.pxPerSecond * currentSeconds;
        return this.notesViewBox.bottom - (seconds * this.pxPerSecond - offsetY);
    }
    switchMainState() {
        if (this.state.canvas == CanvasState.Editing) {
            this.state.canvas = CanvasState.Playing;
        }
        else {
            this.state.canvas = CanvasState.Editing;
        }
    }
    unselect() {
        this.selection.splice(0, this.selection.length);
        this.state.right = RightState.Default;
    }
    deleteSelection() {
        this.currentJudgeLine.notes = this.currentJudgeLine.notes.filter(note => !this.selection.includes(note));
        this.currentEventLayer.moveXEvents = this.currentEventLayer.moveXEvents.filter(event => !this.selection.includes(event));
        this.currentEventLayer.moveYEvents = this.currentEventLayer.moveYEvents.filter(event => !this.selection.includes(event));
        this.currentEventLayer.rotateEvents = this.currentEventLayer.rotateEvents.filter(event => !this.selection.includes(event));
        this.currentEventLayer.alphaEvents = this.currentEventLayer.alphaEvents.filter(event => !this.selection.includes(event));
        this.currentEventLayer.speedEvents = this.currentEventLayer.speedEvents.filter(event => !this.selection.includes(event));
    }
    changeType(type: keyof typeof NoteType) {
        this.currentNoteType = NoteType[type];
    }
    attatchX(x: number) {
        if (this.verticalLineCount <= 1) {
            return x;
        }
        else {
            return round((x - this.notesViewBox.middleX) / this.verticalLineSpace) * this.mainViewBox.width / (this.verticalLineCount - 1);
        }
    }
    /** 
     * 在第seconds秒的时候，把鼠标点击的y坐标吸附到离鼠标最近的横线上并返回所代表的拍数
     * @param {number} seconds 当前的时间秒数
     * @param {number} y 鼠标点击的y坐标
     */
    attatchY(seconds: number, y: number): Beats {
        const beats = this.getBeats(seconds, y);

        const int = floor(beats);
        const decimal = beats - int;

        const fenzi = round(decimal * this.horizonalLineCount);
        const fenmu = this.horizonalLineCount;
        return [int, fenzi, fenmu];
    }
    /** 获取点击的位置在第几拍 */
    getBeats(seconds: number, y: number) {
        /** 第seconds秒的时候，网格已经移动了多少像素了 */
        const offset = seconds * this.pxPerSecond;
        /** 点击的位置离第0拍的横线有多远 */
        const distanceToZero = offset + (this.notesViewBox.bottom - y);
        /** 点击的位置在第几秒 */
        const secondsClick = distanceToZero / this.pxPerSecond;
        /** 点击的位置在第几拍 */
        const beats = secondsToBeats(this.chart.BPMList, secondsClick);
        return beats;
    }
    constructor(chartPackage: ChartPackage, resourcePackage: ResourcePackage) {
        this.chartPackage = chartPackage;
        this.resourcePackage = resourcePackage;
        this.canvasRef = null;
        this.ctx = null;
        eventEmitter.on("MOUSE_LEFT_CLICK", (x, y, _, options) => {
            if (this.state.canvas == CanvasState.Editing) {
                this.mouseLeft(x, y, options.ctrl);
            }
        })
        eventEmitter.on("MOUSE_RIGHT_CLICK", (x, y, seconds) => {
            if (this.state.canvas == CanvasState.Editing) {
                this.mouseRight(x, y, seconds);
            }
        })
        eventEmitter.on("MOUSE_MOVE", (x, y, seconds, options) => {
            if (this.state.canvas == CanvasState.Editing) {
                this.mouseMove(x, y, seconds, options.alt);
            }
        })
        eventEmitter.on("MOUSE_UP", () => {
            this.mouseUp();
        })
    }
    provideCanvas(canvasRef: Ref<HTMLCanvasElement>) {
        this.canvasRef = canvasRef;
        this.ctx = getContext(canvasRef.value);
    }
    mouseUp() {
        if (this.mouseMoveMode == MouseMoveMode.AddHold) {
            this.mouseMoveMode = MouseMoveMode.None;
            const obj = this.selection[0];
            obj.validateTime();
        }
        else if (this.mouseMoveMode == MouseMoveMode.Drag) {
            this.mouseMoveMode = MouseMoveMode.None;
        }
    }
    mouseMove(x: number, y: number, seconds: number, dragEnd: boolean) {
        if (this.mouseMoveMode == MouseMoveMode.AddHold) {
            this.selection[0].endTime = this.attatchY(seconds, y);
        }
        else if (this.mouseMoveMode == MouseMoveMode.Drag) {
            if (dragEnd) {
                this.selection[0].endTime = this.attatchY(seconds, y);
            }
            else {
                this.selection[0].startTime = this.attatchY(seconds, y);
            }
            if (this.selection[0] instanceof Note) {
                this.selection[0].positionX = this.attatchX(x);
            }
        }
        this.mouseX = x;
        this.mouseY = y;
    }
    mouseLeft(x: number, y: number, mutiple: boolean) {
        function getSelectedObject<T>(boxes: Box<T>[]) {
            for (const box of boxes) {
                if (box.touch(x, y)) {
                    return box.data;
                }
            }
            return undefined;
        }
        const selectedObject = getSelectedObject(this.cachedBoxes);
        if (selectedObject != undefined && this.selection.includes(selectedObject)) {
            this.mouseMoveMode = MouseMoveMode.Drag;
        }
        if (!mutiple) this.unselect();
        if (selectedObject) {
            if (mutiple && this.selection.includes(selectedObject))
                this.selection.splice(this.selection.indexOf(selectedObject), 1);
            else
                this.selection.push(selectedObject);
        }
        if (this.selection.length > 0) {
            this.state.right = RightState.Editing;
        }
        else {
            this.state.right = RightState.Default;
        }
    }
    mouseRight(x: number, y: number, seconds: number) {
        const judgeLine = this.chart.judgeLineList[this.currentJudgeLineNumber];
        if (this.notesViewBox.touch(x, y)) {
            const time = this.attatchY(seconds, y);
            const positionX = this.attatchX(x);
            const addedNote = new Note({
                startTime: time,
                endTime: time,
                positionX,
                type: this.currentNoteType,
                speed: 1,
                alpha: 255,
                size: 1,
                visibleTime: 999999,
                yOffset: 0,
                isFake: 0,
                above: NoteAbove.Above
            }, this.chart.BPMList);
            judgeLine.notes.push(addedNote);
            this.unselect();
            this.selection.push(addedNote);
            this.state.right = RightState.Editing;
            if (this.currentNoteType == NoteType.Hold)
                this.mouseMoveMode = MouseMoveMode.AddHold;
        }
        else if (this.eventsViewBox.touch(x, y)) {
            const eventLayer = judgeLine.eventLayers[this.currentEventLayerNumber];
            const time = this.attatchY(seconds, y);
            const track = floor((x - this.eventsViewBox.left) / (this.eventsViewBox.right - this.eventsViewBox.left) * 5);
            switch (track) {
                case 0: {
                    const addedEvent = new NumberEvent({
                        startTime: time
                    }, this.chart.BPMList, 'moveX');
                    eventLayer.moveXEvents.push(addedEvent);
                    this.unselect();
                    this.selection.push(addedEvent);
                    break;
                }
                case 1: {
                    const addedEvent = new NumberEvent({
                        startTime: time
                    }, this.chart.BPMList, 'moveY');
                    eventLayer.moveYEvents.push(addedEvent);
                    this.unselect();
                    this.selection.push(addedEvent);
                    break;
                }
                case 2: {
                    const addedEvent = new NumberEvent({
                        startTime: time
                    }, this.chart.BPMList, 'rotate');
                    eventLayer.rotateEvents.push(addedEvent);
                    this.unselect();
                    this.selection.push(addedEvent);
                    break;
                }
                case 3: {
                    const addedEvent = new NumberEvent({
                        startTime: time
                    }, this.chart.BPMList, 'alpha');
                    eventLayer.alphaEvents.push(addedEvent);
                    this.unselect();
                    this.selection.push(addedEvent);
                    break;
                }
                case 4: {
                    const addedEvent = new NumberEvent({
                        startTime: time
                    }, this.chart.BPMList, 'speed');
                    eventLayer.speedEvents.push(addedEvent);
                    this.unselect();
                    this.selection.push(addedEvent);
                    break;
                }
            }
            this.state.right = RightState.Editing;
            this.mouseMoveMode = MouseMoveMode.AddHold;
        }
    }

    /** 显示编辑器界面到canvas上 */
    renderUI(musicTime: number) {
        if (!this.canvas || !this.ctx) return;
        const canvas = this.canvas;
        const ctx = this.ctx;
        this.ctx.reset();
        const drawRect = canvasUtils.drawRect.bind(ctx);
        const seconds = musicTime - this.chart.META.offset / 1000;
        const drawBackground = () => {
            drawRect(0, 0, canvas.width, canvas.height, this.backgroundColor, true);
        }

        drawBackground();
        this.ctx.lineWidth = this.lineWidth;
        this.ctx.globalAlpha = 1;
        const judgeLine = this.chart.judgeLineList[this.currentJudgeLineNumber];
        const eventLayer = judgeLine.eventLayers[this.currentEventLayerNumber];
        this.drawGrid(seconds);
        this.cachedBoxes = [
            ...this.drawNotes(seconds),
            ...this.drawEvents(seconds, eventLayer.moveXEvents, 'moveX'),
            ...this.drawEvents(seconds, eventLayer.moveYEvents, 'moveY'),
            ...this.drawEvents(seconds, eventLayer.rotateEvents, 'rotate'),
            ...this.drawEvents(seconds, eventLayer.alphaEvents, 'alpha'),
            ...this.drawEvents(seconds, eventLayer.speedEvents, 'speed')
        ]
    }
    /** 显示网格 */
    drawGrid(seconds: number) {
        if (!this.canvas || !this.ctx) return;
        const drawLine = canvasUtils.drawLine.bind(this.ctx);
        const drawRect = canvasUtils.drawRect.bind(this.ctx);
        const writeText = canvasUtils.writeText.bind(this.ctx);
        // 显示横线
        const min = floor(this.getBeats(seconds, this.notesViewBox.bottom));
        const max = ceil(this.getBeats(seconds, this.notesViewBox.top));
        for (let i = min; i <= max; i++) {
            for (let j = 0; j < this.horizonalLineCount; j++) {
                const beats: Beats = [i, j, this.horizonalLineCount];
                const pos = this.getPositionYOfSeconds(seconds, beatsToSeconds(this.chart.BPMList, beats));
                if (j == 0) {
                    writeText(i.toString(),
                        (this.eventsViewBox.left + this.notesViewBox.right) / 2,
                        pos,
                        20,
                        this.horzionalMainLineColor);
                    drawLine(this.notesViewBox.left,
                        pos, this.notesViewBox.right,
                        pos,
                        this.horzionalMainLineColor);
                    drawLine(this.eventsViewBox.left,
                        pos,
                        this.eventsViewBox.right,
                        pos,
                        this.horzionalMainLineColor);
                }
                else {
                    writeText(j.toString(),
                        (this.eventsViewBox.left + this.notesViewBox.right) / 2,
                        pos,
                        20,
                        this.horzionalLineColor);
                    drawLine(this.notesViewBox.left,
                        pos, this.notesViewBox.right,
                        pos,
                        this.horzionalLineColor);
                    drawLine(this.eventsViewBox.left,
                        pos, this.eventsViewBox.right,
                        pos,
                        this.horzionalLineColor);
                }
            }
        }
        // 显示竖线
        if (this.verticalLineCount > 1) {
            drawLine(
                this.notesViewBox.middleX,
                this.notesViewBox.top,
                this.notesViewBox.middleX,
                this.notesViewBox.bottom,
                this.verticalMainLineColor
            );

            for (let i = this.notesViewBox.middleX + this.verticalLineSpace;
                i <= this.notesViewBox.right;
                i += this.verticalLineSpace)
                drawLine(i,
                    this.notesViewBox.top,
                    i, this.notesViewBox.bottom,
                    this.verticalLineColor);

            for (let i = this.notesViewBox.middleX - this.verticalLineSpace;
                i >= this.notesViewBox.left;
                i -= this.verticalLineSpace)
                drawLine(i,
                    this.notesViewBox.top,
                    i,
                    this.notesViewBox.bottom,
                    this.verticalLineColor);
        }
        // 显示事件中间的分隔线
        for (let i = 1; i < 5; i++)
            drawLine(this.eventsViewBox.width * i / 5 + this.eventsViewBox.left,
                this.eventsViewBox.top,
                this.eventsViewBox.width * i / 5 + this.eventsViewBox.left,
                this.notesViewBox.bottom,
                this.verticalMainLineColor);
        // 显示边框
        drawRect(this.notesViewBox.left,
            this.notesViewBox.top,
            this.notesViewBox.width,
            this.notesViewBox.height,
            this.borderColor);
        drawRect(this.eventsViewBox.left,
            this.eventsViewBox.top,
            this.eventsViewBox.width,
            this.eventsViewBox.height,
            this.borderColor);
    }
    /** 显示note */
    drawNotes(seconds: number) {
        if (!this.canvas || !this.ctx) return [];
        const drawRect = canvasUtils.drawRect.bind(this.ctx);
        const judgeLine = this.chart.judgeLineList[this.currentJudgeLineNumber];
        const noteBoxes: Box<Note>[] = [];
        const a = this.attatchY(seconds, this.mouseY);
        const imaginaryNote = new Note({
            startTime: a,
            endTime: a,
            positionX: this.attatchX(this.mouseX),
            type: this.currentNoteType
        }, this.chart.BPMList);
        const hideImaginaryNote = this.mouseMoveMode != MouseMoveMode.None || !this.notesViewBox.touch(this.mouseX, this.mouseY);
        const notes = hideImaginaryNote ? judgeLine.notes : [imaginaryNote, ...judgeLine.notes];
        for (const note of notes) {
            const noteStartSeconds = note.cachedStartSeconds;
            const noteEndSeconds = note.cachedEndSeconds;
            if (seconds >= noteStartSeconds && note.hitSeconds == undefined && !note.isFake) {
                note.hitSeconds = noteStartSeconds;
                this.resourcePackage.playSound(note.type);
            }
            if (note.hitSeconds && seconds < note.hitSeconds) {
                note.hitSeconds = undefined;
            }
            this.ctx.globalAlpha = note == imaginaryNote ? 0.5 : 1;
            if (note.type == NoteType.Hold) {
                const { head, body, end } = this.resourcePackage.getSkin(note.type, note.highlight);

                const baseSize = this.notesViewBox.width / this.canvas.width * this.chartPackage.config.noteSize;
                const noteWidth = baseSize * note.size
                    * this.resourcePackage.getSkin(note.type, note.highlight).body.width
                    / this.resourcePackage.getSkin(note.type, false).body.width;

                const noteX = note.positionX * (this.notesViewBox.width / this.canvas.width) + this.notesViewBox.left + this.notesViewBox.width / 2;
                const noteStartY = this.getPositionYOfSeconds(seconds, noteStartSeconds);
                const noteEndY = this.getPositionYOfSeconds(seconds, noteEndSeconds);
                const noteHeight = noteStartY - noteEndY;
                const noteHeadHeight = head.height / body.width * noteWidth;
                const noteEndHeight = end.height / body.width * noteWidth;

                this.ctx.drawImage(head, noteX - noteWidth / 2, noteStartY, noteWidth, noteHeadHeight);
                this.ctx.drawImage(body, noteX - noteWidth / 2, noteEndY, noteWidth, noteHeight);
                this.ctx.drawImage(end, noteX - noteWidth / 2, noteEndY - noteEndHeight, noteWidth, noteEndHeight);
                if (this.selection.includes(note)) {
                    drawRect(
                        noteX - noteWidth / 2,
                        noteEndY - noteEndHeight,
                        noteWidth,
                        noteEndHeight + noteHeight + noteHeadHeight,
                        [...this.selectionColor, 0.6],
                        true
                    );
                }
                if (note != imaginaryNote) {
                    noteBoxes.push(new Box(
                        noteEndY - this.selectPadding,
                        noteStartY + this.selectPadding,
                        noteX - noteWidth / 2 - this.selectPadding,
                        noteX + noteWidth / 2 + this.selectPadding,
                        note
                    ));
                }
            }
            else {
                const noteImage = this.resourcePackage.getSkin(note.type, note.highlight);

                const baseSize = this.notesViewBox.width / this.canvas.width * this.chartPackage.config.noteSize;
                const noteWidth = baseSize * note.size
                    * this.resourcePackage.getSkin(note.type, note.highlight).width
                    / this.resourcePackage.getSkin(note.type, false).width;

                const noteHeight = noteImage.height / noteImage.width * baseSize;
                const noteX = note.positionX * (this.notesViewBox.width / this.canvas.width) + this.notesViewBox.left + this.notesViewBox.width / 2;
                const noteY = this.getPositionYOfSeconds(seconds, noteStartSeconds);

                this.ctx.drawImage(
                    noteImage,
                    noteX - noteWidth / 2,
                    noteY - noteHeight / 2,
                    noteWidth,
                    noteHeight
                );
                if (this.selection.includes(note)) {
                    drawRect(
                        noteX - noteWidth / 2,
                        noteY - noteHeight / 2,
                        noteWidth,
                        noteHeight,
                        [...this.selectionColor, 0.6],
                        true
                    );
                }
                if (note != imaginaryNote) {
                    noteBoxes.push(new Box(
                        noteY - this.selectPadding,
                        noteY + this.selectPadding,
                        noteX - noteWidth / 2 - this.selectPadding,
                        noteX + noteWidth / 2 + this.selectPadding,
                        note
                    ));
                }
            }
        }
        return noteBoxes;
    }
    /** 显示事件 */
    drawEvents<T extends NumberEvent>(seconds: number, events: T[], type: 'moveX' | 'moveY' | 'rotate' | 'alpha' | 'speed') {
        if (!this.canvas || !this.ctx) return [];
        const drawRect = canvasUtils.drawRect.bind(this.ctx);
        const writeText = canvasUtils.writeText.bind(this.ctx);
        const boxes: Box<T>[] = [];
        const column = {
            moveX: 0,
            moveY: 1,
            rotate: 2,
            alpha: 3,
            speed: 4
        }[type];
        const eventX = this.eventsViewBox.width * (column + 0.5) / 5 + this.eventsViewBox.left;
        for (const event of events) {
            const startSeconds = event.cachedStartSeconds;
            const endSeconds = event.cachedEndSeconds;
            const eventStartY = this.getPositionYOfSeconds(seconds, startSeconds);
            const eventEndY = this.getPositionYOfSeconds(seconds, endSeconds);
            const eventHeight = eventStartY - eventEndY;
            drawRect(
                eventX - this.eventWidth / 2,
                eventEndY,
                this.eventWidth,
                eventHeight,
                this.selection.includes(event) ? this.selectionColor : "white",
                true
            );
            writeText(event.start.toFixed(2), eventX, eventStartY - 1, 30, "orange");
            writeText(event.end.toFixed(2), eventX, eventEndY, 30, "orange");
            const box = new Box(
                eventEndY - this.selectPadding,
                eventStartY + this.selectPadding,
                eventX - this.eventWidth / 2 - this.selectPadding,
                eventX + this.eventWidth / 2 + this.selectPadding,
                event
            );
            boxes.push(box);
        }
        /*
        const currentEventValue = this.interpolateNumberEventValue(this.findLastEvent(events, seconds), seconds);
        writeText(currentEventValue.toFixed(2), eventX, this.eventsViewBox.bottom - 20, 30, "white", false);
        writeText(currentEventValue.toFixed(2), eventX, this.eventsViewBox.bottom - 20, 30, "blue", true);
        */
        return boxes;
    }
}