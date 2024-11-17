import { getContext } from "../tools";
import { RGBcolor, RGBAcolor, Ctx } from "../typeDefinitions";
export class EditableImage {
    canvas: HTMLCanvasElement;
    ctx: Ctx;
    constructor(a: HTMLImageElement | HTMLCanvasElement) {
        this.canvas = document.createElement('canvas');
        this.ctx = getContext(this.canvas);
        this.canvas.width = a.width;
        this.canvas.height = a.height;
        this.ctx.drawImage(a, 0, 0);
    }
    static empty(width: number, height: number) {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        return new EditableImage(canvas);
    }
    static text(text: string, font = "Arial", size = 50, color: RGBcolor = [255, 255, 255]) {
        const canvas = document.createElement("canvas");
        const ctx = getContext(canvas);
        ctx.font = size + "px " + font;
        const textWidth = ctx.measureText(text).width;
        const textHeight = size;
        const padding = 50;
        canvas.width = textWidth + padding * 2;
        canvas.height = textHeight + padding * 2;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgb(" + color[0] + ", " + color[1] + ", " + color[2] + ")";
        ctx.font = size + "px " + font;
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        return new EditableImage(canvas);
    }
    rotate(angle: number) {
        const imageWidth = this.canvas.width;
        const imageHeight = this.canvas.height;
        const canvas = document.createElement("canvas");
        const ctx = getContext(canvas);
        const radians = angle * Math.PI / 180;
        const absSin = Math.abs(Math.sin(radians));
        const absCos = Math.abs(Math.cos(radians));
        const newWidth = imageWidth * absCos + imageHeight * absSin;
        const newHeight = imageWidth * absSin + imageHeight * absCos;
        canvas.width = newWidth;
        canvas.height = newHeight;
        ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        ctx.rotate(radians);
        ctx.drawImage(this.canvas, -imageWidth / 2, -imageHeight / 2);
        this.canvas = canvas;
        this.ctx = ctx;
        return this;
    }
    stretch(w: number, h: number) {
        const imageWidth = this.canvas.width;
        const imageHeight = this.canvas.height;
        const canvas = document.createElement("canvas");
        const ctx = getContext(canvas);
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(this.canvas, 0, 0, imageWidth, imageHeight, 0, 0, w, h);
        this.canvas = canvas;
        this.ctx = ctx;
        return this;
    }
    stretchScale(scaleX: number = 1, scaleY: number = 1) {
        if (scaleX == 1 && scaleY == 1) return this;
        return this.stretch(this.canvas.width * scaleX, this.canvas.height * scaleY);
    }
    cutBottom(length: number) {
        const imageWidth = this.canvas.width;
        const imageHeight = this.canvas.height;
        const canvas = document.createElement("canvas");
        const ctx = getContext(canvas);
        canvas.width = imageWidth;
        canvas.height = imageHeight - length;
        ctx.drawImage(this.canvas, 0, 0, imageWidth, canvas.height, 0, 0, canvas.width, canvas.height);
        this.canvas = canvas;
        this.ctx = ctx;
        return this;
    }
    cutTop(length: number) {
        const imageWidth = this.canvas.width;
        const imageHeight = this.canvas.height;
        const canvas = document.createElement("canvas");
        const ctx = getContext(canvas);
        canvas.width = imageWidth;
        canvas.height = imageHeight - length;
        ctx.drawImage(this.canvas, 0, length, imageWidth, canvas.height, 0, 0, canvas.width, canvas.height);
        this.canvas = canvas;
        this.ctx = ctx;
        return this;
    }
    cutLeft(length: number) {
        const imageWidth = this.canvas.width;
        const imageHeight = this.canvas.height;
        const canvas = document.createElement("canvas");
        const ctx = getContext(canvas);
        canvas.width = imageWidth - length;
        canvas.height = imageHeight;
        ctx.drawImage(this.canvas, 0, 0, canvas.width, imageHeight, 0, 0, canvas.width, canvas.height);
        this.canvas = canvas;
        this.ctx = ctx;
        return this;
    }
    cutRight(length: number) {
        const imageWidth = this.canvas.width;
        const imageHeight = this.canvas.height;
        const canvas = document.createElement("canvas");
        const ctx = getContext(canvas);
        canvas.width = imageWidth - length;
        canvas.height = imageHeight;
        ctx.drawImage(this.canvas, length, 0, canvas.width, imageHeight, 0, 0, canvas.width, canvas.height);
        this.canvas = canvas;
        this.ctx = ctx;
        return this;
    }
    color(color: RGBcolor | RGBAcolor) {
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const canvas = document.createElement("canvas");
        const ctx = getContext(canvas);
        canvas.width = this.canvas.width;
        canvas.height = this.canvas.height;
        for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] = color[0];
            imageData.data[i + 1] = color[1];
            imageData.data[i + 2] = color[2];
            /*
            if (color.length == 4) {
                imageData.data[i + 3] *= color[3] / 0xff;
            }
            */
        }
        ctx.putImageData(imageData, 0, 0);
        this.canvas = canvas;
        this.ctx = ctx;
        return this;
    }
    clone() {
        const newCanvas = document.createElement('canvas');
        const newCtx = getContext(newCanvas);
        newCanvas.width = this.canvas.width;
        newCanvas.height = this.canvas.height;
        newCtx.drawImage(this.canvas, 0, 0);
        return new EditableImage(newCanvas);
    }
}