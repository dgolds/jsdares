/*jshint node:true jquery:true*/
"use strict";

module.exports = function(output) {
	output.CanvasWrapper = function() { return this.init.apply(this, arguments); };
	output.CanvasWrapper.prototype = {
		init: function(canvas) {
			this.canvas = canvas;
			this.context = canvas.getContext('2d');
			this.context.save();
		},
		reset: function() {
			this.context.restore();
			this.context.save();
			this.context.beginPath();
		},
		set: function(name, value) {
			this.context[name] = value;
		},
		getState: function() {
			return {
				strokeStyle: this.context.strokeStyle,
				fillStyle: this.context.fillStyle
			};
		},
		setState: function(state) {
			this.context.strokeStyle = state.strokeStyle;
			this.context.fillStyle = state.fillStyle;
		}
	};

	// some spread is needed between the numbers as borders are blurred, and colour information is thus not 100% reliable
	// therefore we use calculation modulo prime, so that eventually all numbers are used, and this also introduces a nice cycle,
	// so that colours can be used again; the assumption is that whenever there are so many elements on the screen, the ones
	// that introduced faulty colours, or the original ones in case of reusing colours, are most likely overwritten already
	var highlightMult = 67*65536 + 111*256 + 11;
	var highlightPrime = 16777213;

	output.Canvas = function() { return this.init.apply(this, arguments); };
	output.Canvas.prototype = {
		init: function($div, editor, size) {
			this.$div = $div;
			this.$div.addClass('output canvas');

			this.size = size || 550;
			this.$container = $('<div class="canvas-container"></div>');
			this.$div.append(this.$container);
			this.$container.css('max-width', this.size);

			this.$canvas = $('<canvas class="canvas-canvas"></canvas>');
			this.$container.append(this.$canvas);

			this.$canvas.attr('width', this.size);
			this.$canvas.attr('height', this.size);
			this.context = this.$canvas[0].getContext('2d');

			this.$mirrorCanvas = $('<canvas class="canvas-mirror"></canvas>');
			this.$div.append(this.$mirrorCanvas);
			this.$mirrorCanvas.attr('width', this.size);
			this.$mirrorCanvas.attr('height', this.size);
			this.mirrorContext = this.$mirrorCanvas[0].getContext('2d');

			this.wrapper = new output.CanvasWrapper(this.$canvas[0]);
			this.mirrorWrapper = new output.CanvasWrapper(this.$mirrorCanvas[0]);

			this.$targetCanvas = null;

			//this.debugToBrowser = true;
			this.highlighting = false;
			this.highlightCallTarget = 0;
			// this.calls = [];
			// this.stepNum = Infinity;
			this.editor = editor;
			this.editor.addOutput(this);

			//this.clear();
		},

		remove: function() {
			this.$canvas.remove();
			this.$mirrorCanvas.remove();
			if (this.$targetCanvas !== null) {
				this.$targetCanvas.remove();
			}
			this.$container.remove();

			this.$div.removeClass('output canvas');
			this.$div.off('mousemove');
			this.editor.removeOutput(this);
		},

		functions: {
			clearRect: {type: 'function', argsMin: 4, argsMax: 4, example: 'clearRect(100, 100, 100, 100)', draws: true, mirror: true},
			fillRect: {type: 'function', argsMin: 4, argsMax: 4, example: 'fillRect(100, 100, 100, 100)', draws: true, mirror: true},
			strokeRect: {type: 'function', argsMin: 4, argsMax: 4, example: 'strokeRect(100, 100, 100, 100)', draws: true, mirror: true},
			// beginPath: {type: 'function', argsMin: 0, argsMax: 0, example: 'beginPath()', draws: false, mirror: true},
			// closePath: {type: 'function', argsMin: 0, argsMax: 0, example: 'closePath()', draws: false, mirror: true},
			// fill: {type: 'function', argsMin: 0, argsMax: 0, example: 'fill()', draws: true, mirror: true},
			// stroke: {type: 'function', argsMin: 0, argsMax: 0, example: 'stroke()', draws: true, mirror: true},
			// clip: {type: 'function', argsMin: 0, argsMax: 0, example: 'clip()', draws: false, mirror: true},
			// moveTo: {type: 'function', argsMin: 2, argsMax: 2, example: 'moveTo(100, 100)', draws: false, mirror: true},
			// lineTo: {type: 'function', argsMin: 2, argsMax: 2, example: 'lineTo(100, 100)', draws: false, mirror: true},
			// quadraticCurveTo: {type: 'function', argsMin: 4, argsMax: 4, example: 'quadraticCurveTo(30, 80, 100, 100)', draws: false, mirror: true},
			// bezierCurveTo: {type: 'function', argsMin: 6, argsMax: 6, example: 'bezierCurveTo(30, 80, 60, 40, 100, 100)', draws: false, mirror: true},
			// arcTo: {type: 'function', argsMin: 5, argsMax: 5, example: 'arcTo(20, 20, 100, 100, 60)', draws: false, mirror: true},
			// arc: {type: 'function', argsMin: 5, argsMax: 6, example: 'arc(100, 100, 30, 0, 360)', draws: false, mirror: true},
			// rect: {type: 'function', argsMin: 4, argsMax: 4, example: 'rect(100, 100, 100, 100)', draws: false, mirror: true},
			// scale: {type: 'function', argsMin: 2, argsMax: 2, example: 'scale(2.0, 3.0)', draws: true, mirror: true},
			// rotate: {type: 'function', argsMin: 1, argsMax: 1, example: 'rotate(0.40)', draws: true, mirror: true},
			// translate: {type: 'function', argsMin: 2, argsMax: 2, example: 'translate(10, 30)', draws: true, mirror: true},
			// transform: {type: 'function', argsMin: 6, argsMax: 6, example: 'transform(0.8, 0.3, 0.5, 1.0, 10, 30)', draws: true, mirror: true},
			// fillText: {type: 'function', argsMin: 3, argsMax: 4, example: 'fillText("Hello World!", 100, 100)', draws: true, mirror: true},
			// strokeText: {type: 'function', argsMin: 3, argsMax: 4, example: 'strokeText("Hello World!", 100, 100)', draws: true, mirror: true},
			// isPointInPath: {type: 'function', argsMin: 2, argsMax: 2, example: 'isPointInPath(150, 150)', draws: false, mirror: true},
			fillStyle: {type: 'variable', example: 'fillStyle = "#a00"', draws: false, mirror: false},
			strokeStyle: {type: 'variable', example: 'strokeStyle = "#a00"', draws: false, mirror: false},
			// shadowOffsetX: {type: 'variable', example: 'shadowOffsetX = 10', draws: false, mirror: true},
			// shadowOffsetY: {type: 'variable', example: 'shadowOffsetY = 10', draws: false, mirror: true},
			// shadowBlur: {type: 'variable', example: 'shadowBlur = 5', draws: false, mirror: false},
			// shadowColor: {type: 'variable', example: 'shadowColor = "#3a3"', draws: false, mirror: false},
			// globalAlpha: {type: 'variable', example: 'globalAlpha = 0.5', draws: false, mirror: false},
			// lineWidth: {type: 'variable', example: 'lineWidth = 3', draws: false, mirror: false},
			// lineCap: {type: 'variable', example: 'lineCap = "round"', draws: false, mirror: true},
			// lineJoin: {type: 'variable', example: 'lineJoin = "bevel"', draws: false, mirror: true},
			// miterLimit: {type: 'variable', example: 'miterLimit = 3', draws: false, mirror: true},
			// font: {type: 'variable', example: 'font = "40pt Calibri"', draws: false, mirror: true},
			// textAlign: {type: 'variable', example: 'textAlign = "center"', draws: false, mirror: true},
			// textBaseline: {type: 'variable', example: 'textBaseline = "top"', draws: false, mirror: true}
		},

		getAugmentedObject: function() {
			return {
				width: {
					name: 'width',
					info: 'canvas.width',
					type: 'variable',
					example: 'width',
					get: $.proxy(function() {
						return this.size;
					}, this),
					set: function() {
						throw '<var>width</var> cannot be set';
					}
				},
				height: {
					name: 'height',
					info: 'canvas.height',
					type: 'variable',
					example: 'height',
					get: $.proxy(function() {
						return this.size;
					}, this),
					set: function() {
						throw '<var>height</var> cannot be set';
					}
				},
				getContext: {
					name: 'getContext',
					info: 'canvas.getContext',
					type: 'function',
					example: 'getContext("2d")',
					func: $.proxy(function(node, name, args) {
						if (args.length !== 1) {
							throw '<var>getContext</var> takes exactly <var>1</var> argument';
						} else if (args[0] !== '2d') {
							throw 'Only the <var>2d</var> context is supported';
						}
						return this.getContextObject();
					}, this)
				}
			};
		},

		getContextObject: function() {
			var obj = {};
			for (var name in this.functions) {
				var func = this.functions[name];
				if (func.type === 'function') {
					obj[name] = {
						name: name,
						info: 'context.' + name,
						type: 'function',
						func: $.proxy(this.handleMethod, this),
						example: func.example
					};
				} else if (func.type === 'variable') {
					obj[name] = {
						name: name,
						info: 'context.' + name,
						type: 'variable',
						get: $.proxy(this.handleAttributeGet, this),
						set: $.proxy(this.handleAttributeSet, this),
						example: func.example
					};
				}
			}
			this.getContextObject = function() { return obj; };
			return obj;
		},

		handleMethod: function(context, name, args) {
			var min = this.functions[name].argsMin, max = this.functions[name].argsMax;
			if (args.length < min) {
				throw '<var>' + name + '</var> requires at least <var>' + min + '</var> arguments';
			} else if (args.length > max) {
				throw '<var>' + name + '</var> accepts no more than <var>' + max + '</var> arguments';
			}
			this.currentEvent.calls.push({name: name, args: args, state: this.wrapper.getState(), stepNum: context.getStepNum(), nodeId: context.getCallNodeId()});
			return this.context[name].apply(this.context, args);
		},

		handleAttributeGet: function(name) {
			return this.context[name];
		},

		handleAttributeSet: function(context, name, value) {
			//this.currentEvent.calls.push({type: 'variable', name: name, value: value, stepNum: context.getStepNum(), nodeId: context.getCallNodeId()});
			//this.context[name] = value;
			this.wrapper.set(name, value);
		},

		outputStartEvent: function(context) {
			var $originalCanvas = $('<canvas width="' + this.size + '" height="' + this.size + '"></canvas>');
			$originalCanvas[0].getContext('2d').drawImage(this.$canvas[0], 0, 0); // expensive bottleneck!

			this.currentEvent = {
				$originalCanvas: $originalCanvas,
				state: this.wrapper.getState(),
				calls: []
			};
			this.events.push(this.currentEvent);
		},

		outputEndEvent: function() {
		},

		outputClearAll: function() {
			this.wrapper.reset();
			this.context.clearRect(0, 0, this.size, this.size);

			this.events = [];
		},

		outputPopFront: function() {
			var event = this.events.shift();
		},

		outputClearToStart: function() {
			this.wrapper.setState(this.events[0].state);
			this.context.clearRect(0, 0, this.size, this.size);
			this.context.drawImage(this.events[0].$originalCanvas[0], 0, 0);

			this.events = [];
		},

		outputClearToEnd: function() {
			this.events = [];
		},

		outputClearEventsFrom: function(eventNum) {
			this.wrapper.setState(this.events[eventNum].state);
			this.context.clearRect(0, 0, this.size, this.size);
			this.context.drawImage(this.events[eventNum].$originalCanvas[0], 0, 0);

			this.events = this.events.slice(0, eventNum);
		},

		outputSetError: function(error) {
			if (error) {
				this.$canvas.addClass('canvas-error');
			} else {
				this.$canvas.removeClass('canvas-error');
			}
		},

		outputSetEventStep: function(eventNum, stepNum) {
			if (this.currentEvent !== this.events[eventNum] || this.stepNum !== stepNum) {
				this.currentEvent = this.events[eventNum];
				this.stepNum = stepNum;
				this.render();
			}
		},

		highlightCallNodes: function(nodeIds) {
			this.render(true);
			for (var i=0; i<this.currentEvent.calls.length; i++) {
				var call = this.currentEvent.calls[i];
				if (nodeIds.indexOf(call.nodeId) >= 0) {
					this.wrapper.setState(call.state);
					this.context.strokeStyle = 'rgba(5, 195, 5, 0.85)';
					this.context.fillStyle = 'rgba(5, 195, 5, 0.85)';
					this.context.shadowColor = 'rgba(5, 195, 5, 0.85)';
					this.context[call.name].apply(this.context, call.args);
				}
			}
		},

		render: function(highlightEvent) {
			this.wrapper.setState(this.currentEvent.state);
			this.context.clearRect(0, 0, this.size, this.size);
			this.context.drawImage(this.currentEvent.$originalCanvas[0], 0, 0);

			for (var i=0; i<this.currentEvent.calls.length; i++) {
				var call = this.currentEvent.calls[i];
				if (call.stepNum > this.stepNum) break;
				this.wrapper.setState(call.state);

				if (highlightEvent) {
					this.context[call.name].apply(this.context, call.args);
					this.context.strokeStyle = 'rgba(0, 150, 250, 0.25)';
					this.context.fillStyle = 'rgba(0, 150, 250, 0.25)';
					this.context.shadowColor = 'rgba(0, 150, 250, 0.25)';
				}

				this.context[call.name].apply(this.context, call.args);
			}
		},

		drawMirror: function() {
			this.clearMirror();
			for (var i=0; i<this.currentEvent.calls.length; i++) {
				var call = this.currentEvent.calls[i];
				this.mirrorWrapper.setState(call.state);

				var highlightId = (highlightMult*(i+1))%highlightPrime;
				var color = 'rgba(' + (~~(highlightId/65536)%256) + ',' + (~~(highlightId/256)%256) + ',' + (highlightId%256) + ', 1)';
				this.mirrorContext.strokeStyle = color;
				this.mirrorContext.fillStyle = color;
				this.mirrorContext.shadowColor = color;
				this.mirrorContext.lineWidth = Math.max(3, this.context.lineWidth);
				this.mirrorContext[call.name].apply(this.mirrorContext, call.args);
			}
		},

		clearMirror: function() {
			this.mirrorWrapper.setState(this.currentEvent.state);
			this.mirrorContext.clearRect(0, 0, this.size, this.size);
		},

		enableHighlighting: function() {
			this.highlighting = true;
			this.highlightCallIndex = -1;
			this.$div.addClass('canvas-highlighting');
			this.$div.on('mousemove', $.proxy(this.mouseMove, this));
			this.render(true);
			this.drawMirror();
		},

		disableHighlighting: function() {
			this.highlighting = false;
			this.highlightCallIndex = -1;
			this.$div.removeClass('canvas-highlighting');
			this.$div.off('mousemove');
			this.render();
			this.clearMirror();
		},

		getImageData: function() {
			return this.context.getImageData(0, 0, this.size, this.size);
		},

		makeTargetCanvas: function() {
			this.$targetCanvas = $('<canvas class="canvas-target"></canvas>');
			this.$container.append(this.$targetCanvas);
			this.$targetCanvas.attr('width', this.size);
			this.$targetCanvas.attr('height', this.size);
			return this.$targetCanvas[0].getContext('2d');
		},

		getSize: function() {
			return this.size;
		},

		/// INTERNAL FUNCTIONS ///
		mouseMove: function(event) {
			if (this.highlighting) {
				var offset = this.$canvas.offset();
				var x = event.pageX - offset.left, y = event.pageY - offset.top;
				var pixel = this.mirrorContext.getImageData(x, y, 1, 1).data;

				// use the alpha channel as an extra safeguard
				var highlightId = (pixel[3] < 255 ? 0 : (pixel[0]*65536 + pixel[1]*256 + pixel[2]) % 16777213);

				var highlightCallIndex = -1;
				for (var i=0; i<this.currentEvent.calls.length; i++) {
					var highlightIdMatch = (highlightMult*(i+1))%highlightPrime;
					if (highlightId === highlightIdMatch) {
						highlightCallIndex = i;
						break;
					}
				}

				if (this.highlightCallIndex !== highlightCallIndex) {
					this.highlightCallIndex = highlightCallIndex;

					if (this.highlightCallIndex < 0) {
						this.editor.highlightNode(null);
						this.render(true); // == this.highlightCallNodes([]);
					} else {
						this.editor.highlightNodeId(this.currentEvent.calls[this.highlightCallIndex].nodeId);
						this.highlightCallNodes([this.currentEvent.calls[this.highlightCallIndex].nodeId]);
					}
				}
			}
		}
	};
};