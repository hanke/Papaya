
/**
 * @classDescription	An orthogonal viewer.
 */
var papaya = papaya || {};
papaya.viewer = papaya.viewer || {};


/**
 * Constructor.
 * @param {File} file	The file to read and display.
 */
papaya.viewer.Viewer = papaya.viewer.Viewer || function(width, height) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.context = this.canvas.getContext("2d");
    this.canvas.style.padding = 0;
    this.canvas.style.margin = 0;
    this.canvas.style.border = "none";

    this.preferences = new papaya.viewer.Preferences();
    this.atlas = new papaya.viewer.Atlas(papaya.data.TalairachAtlas.data, papaya.data.TalairachAtlas.labels);

    this.initialized = false;
    this.loadingVolume = null;
    this.volume = new papaya.volume.Volume();
    this.screenVolumes = new Array();
    this.currentScreenVolume = null;

    this.axialSlice = null;
    this.coronalSlice = null;
    this.sagittalSlice = null;
    this.mainImage = null;
    this.lowerImageBot = null;
    this.lowerImageTop = null;
    this.viewerDim = 0;
    this.currentCoord = new papaya.core.Coordinate(0, 0, 0);
    this.longestDim = 0;
    this.longestDimSize = 0;
    this.draggingSliceDir = 0;
    this.isDragging = false;
    this.isWindowControl = false;
    this.previousMousePosition = new papaya.core.Point();
    this.draggingOver = false;
    this.isControlKeyDown = false;

    this.listenerMouseMove = bind(this, this.mouseMoveEvent);
    this.listenerMouseDown = bind(this, this.mouseDownEvent);
    this.listenerMouseOut = bind(this, this.mouseOutEvent)
    this.listenerMouseUp = bind(this, this.mouseUpEvent);
    this.listenerKeyDown = bind(this, this.keyDownEvent);
    this.listenerKeyUp = bind(this, this.keyUpEvent);
    this.listenerContextMenu = function(e) { e.preventDefault(); return false; };

    this.drawEmptyViewer();
}


// Public constants
papaya.viewer.Viewer.GAP = PAPAYA_SPACING;  // padding between slice views
papaya.viewer.Viewer.BACKGROUND_COLOR = "rgba(0, 0, 0, 255)";
papaya.viewer.Viewer.CROSSHAIRS_COLOR = "rgba(28, 134, 238, 255)";
papaya.viewer.Viewer.KEYCODE_ROTATE_VIEWS = 32;
papaya.viewer.Viewer.KEYCODE_CENTER = 67;
papaya.viewer.Viewer.KEYCODE_ORIGIN = 79;
papaya.viewer.Viewer.KEYCODE_ARROW_UP = 38;
papaya.viewer.Viewer.KEYCODE_ARROW_DOWN = 40;
papaya.viewer.Viewer.KEYCODE_ARROW_RIGHT = 39;
papaya.viewer.Viewer.KEYCODE_ARROW_LEFT = 37;
papaya.viewer.Viewer.KEYCODE_PAGE_UP = 33;
papaya.viewer.Viewer.KEYCODE_PAGE_DOWN = 34;
papaya.viewer.Viewer.KEYCODE_SINGLE_QUOTE = 222;
papaya.viewer.Viewer.KEYCODE_FORWARD_SLASH = 191;
papaya.viewer.Viewer.KEYCODE_INCREMENT_MAIN = 71;
papaya.viewer.Viewer.KEYCODE_DECREMENT_MAIN = 86;
papaya.viewer.Viewer.KEYCODE_TOGGLE_CROSSHAIRS = 65;


// Public methods
papaya.viewer.Viewer.prototype.loadImage = function(location, url, encoded) {
    if (this.screenVolumes.length == 0) {
        this.loadBaseImage(location, url, encoded);
    } else {
        this.loadOverlay(location, url, encoded);
    }
}




papaya.viewer.Viewer.prototype.loadBaseImage = function(location, url, encoded) {
    this.volume = new papaya.volume.Volume();

    if (encoded) {
        this.volume.readEncodedData(location, bind(this, this.initializeViewer));
    } else if (url || isString(location)) {
        this.volume.readURL(location, bind(this, this.initializeViewer));
    } else {
        this.volume.readFile(location, bind(this, this.initializeViewer));
    }
}





papaya.viewer.Viewer.prototype.loadOverlay = function(location, url, encoded) {
    this.loadingVolume = new papaya.volume.Volume();

    if (encoded) {
        this.loadingVolume.readEncodedData(location, bind(this, this.initializeOverlay));
    } else if (url || isString(location)) {
        this.loadingVolume.readURL(location, bind(this, this.initializeOverlay));
    } else {
        this.loadingVolume.readFile(location, bind(this, this.initializeOverlay));
    }
}



/**
 * Initializes the viewer.
 */
papaya.viewer.Viewer.prototype.initializeViewer = function() {
	if (this.volume.hasError()) {
        papayaMain.papayaDisplay.drawError(this.volume.errorMessage);
		return;
	}

    this.screenVolumes[0] = this.currentScreenVolume = new papaya.viewer.ScreenVolume(this.volume, papaya.viewer.ColorTable.TABLE_GRAYSCALE_NAME, true);

    this.mainImage = this.axialSlice = new papaya.viewer.ScreenSlice(this.volume, papaya.viewer.ScreenSlice.DIRECTION_AXIAL,
	    this.volume.getXDim(), this.volume.getYDim(), this.volume.getXSize(), this.volume.getYSize(), this.screenVolumes);

	this.lowerImageBot = this.coronalSlice = new papaya.viewer.ScreenSlice(this.volume, papaya.viewer.ScreenSlice.DIRECTION_CORONAL,
	    this.volume.getXDim(), this.volume.getZDim(), this.volume.getXSize(), this.volume.getZSize(), this.screenVolumes);

	this.lowerImageTop = this.sagittalSlice = new papaya.viewer.ScreenSlice(this.volume, papaya.viewer.ScreenSlice.DIRECTION_SAGITTAL,
	    this.volume.getYDim(), this.volume.getZDim(), this.volume.getYSize(), this.volume.getZSize(), this.screenVolumes);

	this.canvas.addEventListener("mousemove", this.listenerMouseMove, false);
	this.canvas.addEventListener("mousedown", this.listenerMouseDown, false);
    this.canvas.addEventListener("mouseout", this.listenerMouseOut, false);
    document.addEventListener("mouseup", this.listenerMouseUp, false);
	document.addEventListener("keydown", this.listenerKeyDown, true);
    document.addEventListener("keyup", this.listenerKeyUp, true);
    document.addEventListener("contextmenu", this.listenerContextMenu, false);

	this.setLongestDim(this.volume);
	this.calculateScreenSliceTransforms(this);
	this.currentCoord.setCoordinate(this.volume.getXDim() / 2, this.volume.getYDim() / 2, this.volume.getZDim() / 2);

    this.canvasRect = this.canvas.getBoundingClientRect();

    this.context.fillStyle = "white";
    this.context.fillRect(0, 0, this.canvasRect.right, this.canvasRect.bottom);

    this.initialized = true;
    this.drawViewer();

    papayaMain.papayaToolbar.updateImageButtons();
}





papaya.viewer.Viewer.prototype.initializeOverlay = function(location, url, encoded) {
    if (this.loadingVolume.hasError()) {
        papayaMain.papayaDisplay.drawError(this.loadingVolume.errorMessage);
        this.loadingVolume = null;
        return;
    }

    this.screenVolumes[this.screenVolumes.length] = this.currentScreenVolume = new papaya.viewer.ScreenVolume(this.loadingVolume, this.getNextColorTable(), false);
    this.drawViewer(true);

    this.loadingVolume = null;

    papayaMain.papayaToolbar.updateImageButtons();
}



/**
 * Update position of current coordinate (intersection of crosshairs).
 * @param {Viewer} viewer	the viewer
 * @param {Numeric} xLoc	the new X location
 * @param {Numeric} yLoc	the new Y location 
 */
papaya.viewer.Viewer.prototype.updatePosition = function(viewer, xLoc, yLoc) {
    xLoc = xLoc - this.canvasRect.left;
    yLoc = yLoc - this.canvasRect.top;

    if (this.insideScreenSlice(viewer.axialSlice, xLoc, yLoc, viewer.volume.getXDim(), viewer.volume.getYDim())) {
		if (!this.isDragging || (this.draggingSliceDir == papaya.viewer.ScreenSlice.DIRECTION_AXIAL)) {
			var xImageLoc = (xLoc - viewer.axialSlice.xformTransX) / viewer.axialSlice.xformScaleX;
			var yImageLoc = (yLoc - viewer.axialSlice.xformTransY) / viewer.axialSlice.xformScaleY;

			if ((xImageLoc != viewer.currentCoord.x) || (yImageLoc != viewer.currentCoord.y)) {
				viewer.currentCoord.x = xImageLoc;
				viewer.currentCoord.y = yImageLoc;

				viewer.drawViewer();
			}
		}

		return papaya.viewer.ScreenSlice.DIRECTION_AXIAL;
	} else if (this.insideScreenSlice(viewer.coronalSlice, xLoc, yLoc, viewer.volume.getXDim(), viewer.volume.getZDim())) {
		if (!this.isDragging || (this.draggingSliceDir == papaya.viewer.ScreenSlice.DIRECTION_CORONAL)) {
			var xImageLoc = (xLoc - viewer.coronalSlice.xformTransX) / viewer.coronalSlice.xformScaleX;
			var yImageLoc = (yLoc - viewer.coronalSlice.xformTransY) / viewer.coronalSlice.xformScaleY;

			if ((xImageLoc != viewer.currentCoord.x) || (yImageLoc != viewer.currentCoord.y)) {
				viewer.currentCoord.x = xImageLoc;
				viewer.currentCoord.z = yImageLoc;

				viewer.drawViewer();
			}
		}

		return papaya.viewer.ScreenSlice.DIRECTION_CORONAL;
	} else if (this.insideScreenSlice(viewer.sagittalSlice, xLoc, yLoc, viewer.volume.getYDim(), viewer.volume.getZDim())) {
		if (!this.isDragging || (this.draggingSliceDir == papaya.viewer.ScreenSlice.DIRECTION_SAGITTAL)) {
			var xImageLoc = (xLoc - viewer.sagittalSlice.xformTransX) / viewer.sagittalSlice.xformScaleX;
			var yImageLoc = (yLoc - viewer.sagittalSlice.xformTransY) / viewer.sagittalSlice.xformScaleY;

			if ((xImageLoc != viewer.currentCoord.x) || (yImageLoc != viewer.currentCoord.y)) {
				viewer.currentCoord.y = xImageLoc;
				viewer.currentCoord.z = yImageLoc;

				viewer.drawViewer();
			}
		}

		return papaya.viewer.ScreenSlice.DIRECTION_SAGITTAL;
	} else {
		return papaya.viewer.ScreenSlice.DIRECTION_UNKNOWN;
	}
}


papaya.viewer.Viewer.prototype.updateCursorPosition = function(viewer, xLoc, yLoc) {
    xLoc = xLoc - this.canvasRect.left;
    yLoc = yLoc - this.canvasRect.top;

    if (this.insideScreenSlice(viewer.axialSlice, xLoc, yLoc, viewer.volume.getXDim(), viewer.volume.getYDim())) {
        var xImageLoc = (xLoc - viewer.axialSlice.xformTransX) / viewer.axialSlice.xformScaleX;
        var yImageLoc = (yLoc - viewer.axialSlice.xformTransY) / viewer.axialSlice.xformScaleY;
        var zImageLoc = viewer.axialSlice.currentSlice;

        if (papayaMain.papayaDisplay) {
            papayaMain.papayaDisplay.drawDisplay(xImageLoc, yImageLoc, zImageLoc, this.getCurrentValueAt(xImageLoc, yImageLoc, zImageLoc));
        }
    } else if (this.insideScreenSlice(viewer.coronalSlice, xLoc, yLoc, viewer.volume.getXDim(), viewer.volume.getZDim())) {
        var xImageLoc = (xLoc - viewer.coronalSlice.xformTransX) / viewer.coronalSlice.xformScaleX;
        var zImageLoc = (yLoc - viewer.coronalSlice.xformTransY) / viewer.coronalSlice.xformScaleY;
        var yImageLoc = viewer.coronalSlice.currentSlice;

        if (papayaMain.papayaDisplay) {
            papayaMain.papayaDisplay.drawDisplay(xImageLoc, yImageLoc, zImageLoc, this.getCurrentValueAt(xImageLoc, yImageLoc, zImageLoc));
        }
    } else if (this.insideScreenSlice(viewer.sagittalSlice, xLoc, yLoc, viewer.volume.getYDim(), viewer.volume.getZDim())) {
        var yImageLoc = (xLoc - viewer.sagittalSlice.xformTransX) / viewer.sagittalSlice.xformScaleX;
        var zImageLoc = (yLoc - viewer.sagittalSlice.xformTransY) / viewer.sagittalSlice.xformScaleY;
        var xImageLoc = viewer.sagittalSlice.currentSlice;

        if (papayaMain.papayaDisplay) {
            papayaMain.papayaDisplay.drawDisplay(xImageLoc, yImageLoc, zImageLoc, this.getCurrentValueAt(xImageLoc, yImageLoc, zImageLoc));
        }
    } else {
        if (papayaMain.papayaDisplay) {
            papayaMain.papayaDisplay.drawEmptyDisplay();
        }
    }
}



/**
 * Tests whether a screen coordinate is within a slice.
 * @param {ScreenSlice} screenSlice	the screen slice to test
 * @param {Numeric} xLoc	the X location
 * @param {Numeric} yLoc	the Y location
 * @param {Numeric} xBound	the X dimension limit
 * @param {Numeric} yBound	the Y dimension limit
 */
papaya.viewer.Viewer.prototype.insideScreenSlice = function(screenSlice, xLoc, yLoc, xBound, yBound) {
	var xStart = round(screenSlice.xformTransX);
	var xEnd = round(screenSlice.xformTransX + xBound*screenSlice.xformScaleX);
	var yStart = round(screenSlice.xformTransY);
	var yEnd = round(screenSlice.xformTransY + yBound*screenSlice.xformScaleY);
	return ((xLoc >= xStart) && (xLoc < xEnd) && (yLoc >= yStart) && (yLoc < yEnd));
}



papaya.viewer.Viewer.prototype.drawEmptyViewer = function() {
    // clear area
    this.context.fillStyle = "#000000";
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // draw drop text
    this.context.fillStyle = "#AAAAAA";
    var fontSize = 18;
    this.context.font = fontSize+"px Arial";
    locY = this.canvas.height - 20;
    var text = "Drop a file here or click the File menu";
    var metrics = this.context.measureText(text);
    var textWidth = metrics.width;
    this.context.fillText(text, (this.canvas.width / 2) - (textWidth / 2), locY);

    if (this.canvas.width > 900) {
        // draw supported formats
        fontSize = 14;
        this.context.font = fontSize+"px Arial";
        locY = this.canvas.height - 20;
        text = "Supported formats: NIFTI (.nii, .nii.gz)";
        metrics = this.context.measureText(text);
        textWidth = metrics.width;
        this.context.fillText(text, 20, locY);

        // draw Papaya version info
        fontSize = 14;
        this.context.font = fontSize+"px Arial";
        locY = this.canvas.height - 20;

        if (typeof PAPAYA_VERSION_ID === 'undefined') {
            PAPAYA_VERSION_ID = "0.0";
        }

        if (typeof PAPAYA_BUILD_NUM === 'undefined') {
            PAPAYA_BUILD_NUM = "0";
        }

        text = "Papaya v" + (PAPAYA_VERSION_ID ? PAPAYA_VERSION_ID : "Dev") + " (build " + (PAPAYA_BUILD_NUM != undefined ? PAPAYA_BUILD_NUM : "Dev") + ")";
        metrics = this.context.measureText(text);
        textWidth = metrics.width;
        this.context.fillText(text, this.canvas.width - textWidth - 20, locY);
    }
}



/**
 * Draw the current state of the viewer.
 */
papaya.viewer.Viewer.prototype.drawViewer = function(force) {
	this.context.save();

	// update slice data
	this.axialSlice.updateSlice(this.currentCoord.z, force);
	this.coronalSlice.updateSlice(this.currentCoord.y, force);
	this.sagittalSlice.updateSlice(this.currentCoord.x, force);

	// intialize screen slices
	this.context.fillStyle = papaya.viewer.Viewer.BACKGROUND_COLOR;

	// draw screen slices
	this.context.setTransform(1, 0, 0, 1, 0, 0);
	this.context.fillRect(this.mainImage.screenOffsetX, this.mainImage.screenOffsetY, this.mainImage.screenDim, this.mainImage.screenDim);
	this.context.setTransform(this.mainImage.xformScaleX, 0, 0, this.mainImage.xformScaleY, this.mainImage.xformTransX, this.mainImage.xformTransY);
	this.context.drawImage(this.mainImage.canvasMain, 0, 0);

	this.context.setTransform(1, 0, 0, 1, 0, 0);
	this.context.fillRect(this.lowerImageBot.screenOffsetX, this.lowerImageBot.screenOffsetY, this.lowerImageBot.screenDim, this.lowerImageBot.screenDim);
	this.context.setTransform(this.lowerImageBot.xformScaleX, 0, 0, this.lowerImageBot.xformScaleY, this.lowerImageBot.xformTransX, this.lowerImageBot.xformTransY);
	this.context.drawImage(this.lowerImageBot.canvasMain, 0, 0);

	this.context.setTransform(1, 0, 0, 1, 0, 0);
	this.context.fillRect(this.lowerImageTop.screenOffsetX, this.lowerImageTop.screenOffsetY, this.lowerImageTop.screenDim, this.lowerImageTop.screenDim);
	this.context.setTransform(this.lowerImageTop.xformScaleX, 0, 0, this.lowerImageTop.xformScaleY, this.lowerImageTop.xformTransX, this.lowerImageTop.xformTransY);
	this.context.drawImage(this.lowerImageTop.canvasMain, 0, 0);

    if (this.preferences.showCrosshairs) {
        // initialize crosshairs
        this.context.setTransform(1, 0, 0, 1, 0, 0);
        this.context.strokeStyle = papaya.viewer.Viewer.CROSSHAIRS_COLOR;
        this.context.lineWidth = 1.0;
        this.context.beginPath();

        if ((this.mainImage != this.axialSlice) || this.preferences.showMainCrosshairs) {
            // draw axial crosshairs
            var xLoc = floor(this.axialSlice.xformTransX + (this.currentCoord.x)*this.axialSlice.xformScaleX);
            var yStart = floor(this.axialSlice.xformTransY);
            var yEnd = floor(this.axialSlice.xformTransY + this.axialSlice.yDim*this.axialSlice.xformScaleY);
            this.context.moveTo(xLoc+.5, yStart);
            this.context.lineTo(xLoc+.5, yEnd);

            var yLoc = floor(this.axialSlice.xformTransY + (this.currentCoord.y)*this.axialSlice.xformScaleY);
            var xStart = floor(this.axialSlice.xformTransX);
            var xEnd = floor(this.axialSlice.xformTransX + this.axialSlice.xDim*this.axialSlice.xformScaleX);
            this.context.moveTo(xStart, yLoc+.5);
            this.context.lineTo(xEnd, yLoc+.5);
        }

        if ((this.mainImage != this.coronalSlice) || this.preferences.showMainCrosshairs) {
            // draw coronal crosshairs
            xLoc = floor(this.coronalSlice.xformTransX + this.currentCoord.x*this.coronalSlice.xformScaleX);
            yStart = floor(this.coronalSlice.xformTransY);
            yEnd = floor(this.coronalSlice.xformTransY + this.coronalSlice.yDim*this.coronalSlice.xformScaleY);
            this.context.moveTo(xLoc+.5, yStart);
            this.context.lineTo(xLoc+.5, yEnd);

            yLoc = floor(this.coronalSlice.xformTransY + this.currentCoord.z*this.coronalSlice.xformScaleY);
            xStart = floor(this.coronalSlice.xformTransX);
            xEnd = floor(this.coronalSlice.xformTransX + this.coronalSlice.xDim*this.coronalSlice.xformScaleX);
            this.context.moveTo(xStart, yLoc+.5);
            this.context.lineTo(xEnd, yLoc+.5);
        }

        if ((this.mainImage != this.sagittalSlice) || this.preferences.showMainCrosshairs) {
            // draw sagittal crosshairs
            xLoc = floor(this.sagittalSlice.xformTransX + this.currentCoord.y*this.sagittalSlice.xformScaleX);
            yStart = floor(this.sagittalSlice.xformTransY);
            yEnd = floor(this.sagittalSlice.xformTransY + this.sagittalSlice.yDim*this.sagittalSlice.xformScaleY);
            this.context.moveTo(xLoc+.5, yStart);
            this.context.lineTo(xLoc+.5, yEnd);

            yLoc = floor(this.sagittalSlice.xformTransY + this.currentCoord.z*this.sagittalSlice.xformScaleY);
            xStart = floor(this.sagittalSlice.xformTransX);
            xEnd = floor(this.sagittalSlice.xformTransX + this.sagittalSlice.xDim*this.sagittalSlice.xformScaleX);
            this.context.moveTo(xStart, yLoc+.5);
            this.context.lineTo(xEnd, yLoc+.5);
        }

        // finish crosshairs drawing
        this.context.closePath();
        this.context.stroke();
        this.context.restore();
    }

    if (papayaMain.papayaDisplay) {
        papayaMain.papayaDisplay.drawDisplay(this.currentCoord.x, this.currentCoord.y, this.currentCoord.z, this.getCurrentValueAt(this.currentCoord.x, this.currentCoord.y, this.currentCoord.z));
    }
}


/**
 * Calculates screen slice positions.
 * @param {Viewer} viewer	the viewer
 */
papaya.viewer.Viewer.prototype.calculateScreenSliceTransforms = function(viewer) {
	//viewer.canvas.height = PAPAYA_DEFAULT_HEIGHT;
	viewer.viewerDim = viewer.canvas.height;
	//viewer.canvas.setAttribute("width", viewer.viewerDim * 1.5);

	this.getTransformParameters(viewer.mainImage, viewer.viewerDim, false);
	viewer.mainImage.xformTransX += viewer.mainImage.screenOffsetX = 0;
	viewer.mainImage.xformTransY += viewer.mainImage.screenOffsetY = 0;

	this.getTransformParameters(viewer.lowerImageBot, viewer.viewerDim, true);
	viewer.lowerImageBot.xformTransX += viewer.lowerImageBot.screenOffsetX = (viewer.viewerDim + (papaya.viewer.Viewer.GAP));
	viewer.lowerImageBot.xformTransY += viewer.lowerImageBot.screenOffsetY = (((viewer.viewerDim-papaya.viewer.Viewer.GAP) / 2) + (papaya.viewer.Viewer.GAP));

	this.getTransformParameters(viewer.lowerImageTop, viewer.viewerDim, true);
	viewer.lowerImageTop.xformTransX += viewer.lowerImageTop.screenOffsetX = (viewer.viewerDim + (papaya.viewer.Viewer.GAP));
	viewer.lowerImageTop.xformTransY += viewer.lowerImageTop.screenOffsetY = 0;
}


/**
 * Calculates individual screen slice position.
 * @param {ScreenSlice} image	the screen slice
 * @param {Numeric} height	the height of the viewer
 * @param {Boolean} lower	true if this screen slice it not the main (larger) slice
 */
papaya.viewer.Viewer.prototype.getTransformParameters = function(image, height, lower) {
	var bigScale = lower ? 2 : 1;
	var scaleX, scaleY;

	if (image.getRealWidth() > image.getRealHeight()) {
		scaleX = (((lower ? height-papaya.viewer.Viewer.GAP : height) / this.longestDim) / bigScale) * (image.getXSize() / this.longestDimSize);
		scaleY = ((((lower ? height-papaya.viewer.Viewer.GAP : height) / this.longestDim) * image.getYXratio()) / bigScale) * (image.getXSize() / this.longestDimSize);
	} else {
		scaleX = ((((lower ? height-papaya.viewer.Viewer.GAP : height) / this.longestDim) * image.getXYratio()) / bigScale) * (image.getYSize() / this.longestDimSize);
		scaleY = (((lower ? height-papaya.viewer.Viewer.GAP : height) / this.longestDim) / bigScale) * (image.getYSize() / this.longestDimSize);
	}

	var transX = (((lower ? height-papaya.viewer.Viewer.GAP : height) / bigScale) - (image.getXDim() * scaleX)) / 2;
	var transY = (((lower ? height-papaya.viewer.Viewer.GAP : height) / bigScale) - (image.getYDim() * scaleY)) / 2;

	image.screenDim = (lower ? (height-papaya.viewer.Viewer.GAP) / 2 : height);
	image.xformScaleX = scaleX;
	image.xformScaleY = scaleY;
	image.xformTransX = transX;
	image.xformTransY = transY;
}


/**
 * Calculates the longest dimension.
 * @param {Volume} volume	the volume
 */
papaya.viewer.Viewer.prototype.setLongestDim = function(volume) {
	this.longestDim = volume.getXDim();
	this.longestDimSize = volume.getXSize();

	if ((volume.getYDim() * volume.getYSize()) > (this.longestDim * this.longestDimSize)) {
		this.longestDim = volume.getYDim();
		this.longestDimSize = volume.getYSize();
	}

	if ((volume.getZDim() * volume.getZSize()) > (this.longestDim * this.longestDimSize)) {
		this.longestDim = volume.getZDim();
		this.longestDimSize = volume.getZSize();
	}
}


/**
 * The keydown event callback.
 * @param {Object} ke	the key event
 */
papaya.viewer.Viewer.prototype.keyDownEvent = function(ke) {
	var keyCode = getKeyCode(ke);

    if (isControlKey(ke)) {
        this.isControlKeyDown = true;
    } else if (keyCode == papaya.viewer.Viewer.KEYCODE_ROTATE_VIEWS) {
		var temp = this.lowerImageBot;
		this.lowerImageBot = this.lowerImageTop;
		this.lowerImageTop = this.mainImage;
		this.mainImage = temp;
		this.calculateScreenSliceTransforms(this);
		this.drawViewer();
	} else if (keyCode == papaya.viewer.Viewer.KEYCODE_CENTER) {
        var center = new papaya.core.Coordinate(this.volume.header.imageDimensions.xDim / 2, this.volume.header.imageDimensions.yDim / 2, this.volume.header.imageDimensions.zDim / 2);
        this.gotoCoordinate(center);
    } else if (keyCode == papaya.viewer.Viewer.KEYCODE_ORIGIN) {
        this.gotoCoordinate(this.volume.header.origin);
    } else if (keyCode == papaya.viewer.Viewer.KEYCODE_ARROW_UP) {
        this.currentCoord.y--;
        this.gotoCoordinate(this.currentCoord);
    } else if (keyCode == papaya.viewer.Viewer.KEYCODE_ARROW_DOWN) {
        this.currentCoord.y++;
        this.gotoCoordinate(this.currentCoord);
    } else if (keyCode == papaya.viewer.Viewer.KEYCODE_ARROW_LEFT) {
        this.currentCoord.x--;
        this.gotoCoordinate(this.currentCoord);
    } else if (keyCode == papaya.viewer.Viewer.KEYCODE_ARROW_RIGHT) {
        this.currentCoord.x++;
        this.gotoCoordinate(this.currentCoord);
    } else if ((keyCode == papaya.viewer.Viewer.KEYCODE_PAGE_DOWN) || (keyCode == papaya.viewer.Viewer.KEYCODE_FORWARD_SLASH)) {
        this.currentCoord.z++;
        this.gotoCoordinate(this.currentCoord);
    } else if ((keyCode == papaya.viewer.Viewer.KEYCODE_PAGE_UP) || (keyCode == papaya.viewer.Viewer.KEYCODE_SINGLE_QUOTE)) {
        this.currentCoord.z--;
        this.gotoCoordinate(this.currentCoord);
    } else if ((keyCode == papaya.viewer.Viewer.KEYCODE_PAGE_DOWN) || (keyCode == papaya.viewer.Viewer.KEYCODE_FORWARD_SLASH)) {
        this.currentCoord.z++;
        this.gotoCoordinate(this.currentCoord);
    } else if (keyCode == papaya.viewer.Viewer.KEYCODE_INCREMENT_MAIN) {
        if (this.mainImage.sliceDirection == papaya.viewer.ScreenSlice.DIRECTION_AXIAL) {
            this.currentCoord.z--;
        } else if (this.mainImage.sliceDirection == papaya.viewer.ScreenSlice.DIRECTION_CORONAL) {
            this.currentCoord.y--;
        } else if (this.mainImage.sliceDirection == papaya.viewer.ScreenSlice.DIRECTION_SAGITTAL) {
            this.currentCoord.x++;
        }

        this.gotoCoordinate(this.currentCoord);
    } else if (keyCode == papaya.viewer.Viewer.KEYCODE_DECREMENT_MAIN) {
        if (this.mainImage.sliceDirection == papaya.viewer.ScreenSlice.DIRECTION_AXIAL) {
            this.currentCoord.z++;
        } else if (this.mainImage.sliceDirection == papaya.viewer.ScreenSlice.DIRECTION_CORONAL) {
            this.currentCoord.y++;
        } else if (this.mainImage.sliceDirection == papaya.viewer.ScreenSlice.DIRECTION_SAGITTAL) {
            this.currentCoord.x--;
        }

        this.gotoCoordinate(this.currentCoord);
    } else if (keyCode == papaya.viewer.Viewer.KEYCODE_TOGGLE_CROSSHAIRS) {
        this.preferences.showMainCrosshairs = !this.preferences.showMainCrosshairs;
        this.drawViewer(true);
    }
}



papaya.viewer.Viewer.prototype.keyUpEvent = function(ke) {
    var keyCode = getKeyCode(ke);

    if (isControlKey(ke)) {
        this.isControlKeyDown = false;
    }
}



/**
 * The mousedown event callback.
 * @param {Object} me	the mouse event
 */
papaya.viewer.Viewer.prototype.mouseDownEvent = function(me) {
    papayaMain.papayaToolbar.closeAllMenus();

    if ((me.which == 3) || this.isControlKeyDown) {
        this.isWindowControl = true;
        this.previousMousePosition.x = getMousePositionX(me);
        this.previousMousePosition.y = getMousePositionY(me);
    } else {
        this.draggingSliceDir = this.updatePosition(this, getMousePositionX(me), getMousePositionY(me));
    }

    this.isDragging = true;

    me.preventDefault();
}


/**
 * The mouseup event callback.
 * @param {Object} me	the mouse event
 */
papaya.viewer.Viewer.prototype.mouseUpEvent = function(me) {
	this.isDragging = false;
    this.isWindowControl = false;
}



/**
 * The mousemove event callback.
 * @param {Object} me 	the mouse event
 */
papaya.viewer.Viewer.prototype.mouseMoveEvent = function(me) {
	if (this.isDragging) {
        if (this.isWindowControl) {
            var currentMouseX = getMousePositionX(me);
            var currentMouseY = getMousePositionY(me);

            this.windowLevelChanged(this.previousMousePosition.x - currentMouseX, this.previousMousePosition.y - currentMouseY);

            this.previousMousePosition.x = currentMouseX;
            this.previousMousePosition.y = currentMouseY;
        } else {
            this.updatePosition(this, getMousePositionX(me), getMousePositionY(me));
        }
	} else {
        this.updateCursorPosition(this, getMousePositionX(me), getMousePositionY(me));
    }
}



papaya.viewer.Viewer.prototype.mouseOutEvent = function(me) {
    papayaMain.papayaDisplay.drawEmptyDisplay();
}




papaya.viewer.Viewer.prototype.windowLevelChanged = function(contrastChange, brightnessChange) {
    var range = this.currentScreenVolume.volume.header.imageRange.imageMax - this.currentScreenVolume.volume.header.imageRange.imageMin;
    var step = range * .025;

    var minFinal;
    var maxFinal;

    if (Math.abs(contrastChange) > Math.abs(brightnessChange)) {
        minFinal = this.currentScreenVolume.screenMin + (step * signum(contrastChange));
        maxFinal = this.currentScreenVolume.screenMax + (-1 * step * signum(contrastChange));

        if (maxFinal <= minFinal) {
            minFinal = this.currentScreenVolume.screenMin;
            maxFinal = this.currentScreenVolume.screenMin; // yes, min
        }
    } else {
        minFinal = this.currentScreenVolume.screenMin + (step * signum(brightnessChange));
        maxFinal = this.currentScreenVolume.screenMax + (step * signum(brightnessChange));
    }

    this.currentScreenVolume.setScreenRange(minFinal, maxFinal);
    this.drawViewer(true);
}



papaya.viewer.Viewer.prototype.colorTableChanged = function(name) {
    this.currentScreenVolume.changeColorTable(name);
    this.drawViewer(true);
}



papaya.viewer.Viewer.prototype.gotoCoordinate = function(coor) {
    this.currentCoord.x = coor.x;
    this.currentCoord.y = coor.y;
    this.currentCoord.z = coor.z;

    this.drawViewer(true);
}



papaya.viewer.Viewer.prototype.resizeViewer = function(dims) {
    this.canvas.width = dims.width;
    this.canvas.height = dims.height;

    if (this.initialized) {
        this.calculateScreenSliceTransforms(this);
        this.canvasRect = this.canvas.getBoundingClientRect();
        this.drawViewer(true);
    }
}


papaya.viewer.Viewer.prototype.getWorldCoordinateAtIndex = function(ctrX, ctrY, ctrZ, coord) {
    coord.setCoordinate((ctrX - this.volume.header.origin.x) * this.volume.header.voxelDimensions.xSize, (this.volume.header.origin.y - ctrY) * this.volume.header.voxelDimensions.ySize, (this.volume.header.origin.z - ctrZ) * this.volume.header.voxelDimensions.zSize);
    return coord;
}



papaya.viewer.Viewer.prototype.getNextColorTable = function() {
    var value = (this.screenVolumes.length - 1) % 5;
    if (value == 0) {
        return papaya.viewer.ColorTable.TABLE_RED2WHITE_NAME;
    } else if (value == 1) {
        return papaya.viewer.ColorTable.TABLE_GREEN2WHITE_NAME;
    } else if (value == 2) {
        return papaya.viewer.ColorTable.TABLE_BLUE2WHITE_NAME;
    } else if (value == 3) {
        return papaya.viewer.ColorTable.TABLE_ORANGE2WHITE_NAME;
    } else if (value == 4) {
        return papaya.viewer.ColorTable.TABLE_PURPLE2WHITE_NAME;
    }
}



papaya.viewer.Viewer.prototype.getCurrentValueAt = function(ctrX, ctrY, ctrZ) {
    if (this.currentScreenVolume.isOverlay()) {
        return this.currentScreenVolume.volume.getVoxelAtCoordinate((ctrX - this.volume.header.origin.x) * this.volume.header.voxelDimensions.xSize,
                (this.volume.header.origin.y - ctrY) * this.volume.header.voxelDimensions.ySize, (this.volume.header.origin.z - ctrZ) * this.volume.header.voxelDimensions.zSize, true);
    } else {
        return value = this.currentScreenVolume.volume.getVoxelAtIndex(ctrX, ctrY, ctrZ, true);
    }
}



papaya.viewer.Viewer.prototype.resetViewer = function() {
    this.initialized = false;
    this.loadingVolume = null;
    this.volume = new papaya.volume.Volume();
    this.screenVolumes = new Array();
    this.currentScreenVolume = null;

    this.axialSlice = null;
    this.coronalSlice = null;
    this.sagittalSlice = null;
    this.mainImage = null;
    this.lowerImageBot = null;
    this.lowerImageTop = null;
    this.viewerDim = 0;
    this.currentCoord = new papaya.core.Coordinate(0, 0, 0);
    this.longestDim = 0;
    this.longestDimSize = 0;
    this.draggingSliceDir = 0;
    this.isDragging = false;
    this.isWindowControl = false;
    this.previousMousePosition = new papaya.core.Point();

    this.canvas.removeEventListener("mousemove", this.listenerMouseMove, false);
    this.canvas.removeEventListener("mousedown", this.listenerMouseDown, false);
    this.canvas.removeEventListener("mouseout", this.listenerMouseOut, false);
    document.removeEventListener("mouseup", this.listenerMouseUp, false);
    document.removeEventListener("keydown", this.listenerKeyDown, true);
    document.removeEventListener("keyup", this.listenerKeyUp, true);
    document.removeEventListener("contextmenu", this.listenerContextMenu, false);

    this.drawEmptyViewer();
    if (papayaMain.papayaDisplay) {
        papayaMain.papayaDisplay.drawEmptyDisplay();
    }
}