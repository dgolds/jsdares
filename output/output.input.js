/*jshint node:true jquery:true*/
"use strict";

module.exports = function(output) {
	output.Input = function() { return this.init.apply(this, arguments); };
	output.Input.prototype = {
		init: function(editor) {
			this.editor = editor;

			this.$keyDown = $.proxy(this.keyDown, this);
			this.$keyUp = $.proxy(this.keyUp, this);
			$(document).on('keydown', this.$keyDown);
			$(document).on('keyup', this.$keyUp);

			this.onmousemove = [];
			this.onmousedown = [];
			this.onmouseup = [];
			this.intervalId = null;
			this.start = true;
			this.outputClearAllEvents();
		},

		remove: function() {
			this.clearInterval();
			this.clearMouse();
			$(document).off('keydown', this.$keyDown);
			$(document).off('keyup', this.$keyUp);
		},

		addMouseEvents: function($element, name, obj) {
			var current = this.onmousemove.length;
			this.onmousemove.push({$element: $element, func: null, handle: null, timer: null});
			this.onmousedown.push({$element: $element, func: null, handle: null});
			this.onmouseup.push({$element: $element, func: null, handle: null});

			obj.properties.onmousemove = this.getMouseObject(current, 'mousemove', 'mouseMove');
			obj.properties.onmousedown = this.getMouseObject(current, 'mousedown', 'mouseDown');
			obj.properties.onmouseup = this.getMouseObject(current, 'mouseup', 'mouseUp');
		},

		getMouseObject: function(current, type, niceType) {
			var fullType = 'on' + type;
			return {
				name: fullType,
				info: name + '.' + fullType,
				type: 'variable',
				example: fullType + ' = ' + niceType,
				get: $.proxy(function(name) {
							return this[fullType][current].func;
					}, this),
				set: $.proxy(function(context, name, value) {
						this.checkStart();
						if (value.type !== 'internalFunction') {
							throw 'You can only set <var>' + name + '</var> to a function declared by you';
						}
						var info = this[fullType][current];
						info.func = value;
						if (info.handle === null) {
							info.handle = $.proxy(function(event) {
								this[niceType](current, event);
							}, this);
							this[fullType][current].$element.on(type, info.handle);
						}
						this.editor.makeInteractive();
					}, this)
			};
		},

		getAugmentedDocumentObject: function() {
			return {
				type: 'object',
				string: '[object document]',
				properties: {
					onkeydown: {
						name: 'onkeydown',
						info: 'document.onkeydown',
						type: 'variable',
						example: 'onkeydown = keyDown',
						get: $.proxy(this.handleKeyboardGet, this),
						set: $.proxy(this.handleKeyboardSet, this)
					},
					onkeyup: {
						name: 'onkeyup',
						info: 'document.onkeyup',
						type: 'variable',
						example: 'onkeyup = keyUp',
						get: $.proxy(this.handleKeyboardGet, this),
						set: $.proxy(this.handleKeyboardSet, this)
					}
				}
			};
		},

		getAugmentedWindowObject: function() {
			return {
				type: 'object',
				string: '[object window]',
				properties: {
					setInterval: {
						name: 'setInterval',
						info: 'window.setInterval',
						type: 'function',
						example: 'setInterval(func, 30)',
						string: '[function window.setInterval]',
						func: $.proxy(this.handleTimeCall, this)
					}
				}
			};
		},

		handleKeyboardGet: function(name) {
			return this[name];
		},

		handleKeyboardSet: function(context, name, value) {
			this.checkStart();

			if (value.type !== 'internalFunction') {
				throw 'You can only set <var>' + name + '</var> to a function declared by you';
			}
			this[name] = value;
			this.editor.makeInteractive();
		},

		handleTimeCall: function(context, name, args) {
			this.checkStart();

			if (args.length !== 2) {
				throw '<var>setInterval</var> takes exactly <var>2</var> arguments';
			} else if (args[0].type !== 'internalFunction') {
				throw 'First argument to <var>setInterval</var> must be the name of a function declared by you';
			} else if (typeof args[1] !== 'number' || args[1] < 25) {
				throw 'Second argument to <var>setInterval</var> must be a number specifying the time in milliseconds, and cannot be smaller than 25';
			}

			this.clearInterval();
			this.interval = args[0];
			this.intervalId = setInterval($.proxy(this.doInterval, this), args[1]);
			this.editor.makeInteractive();
		},

		keyDown: function(event) {
			// 17 == CTRL, 18 == ALT, (17, 91, 93, 224) == COMMAND, 27 == ESC
			// block these as they are only keyboard shortcuts
			if ([17, 18, 91, 93, 224, 27].indexOf(event.keyCode) >= 0) {
				return;
			}
			if (this.onkeydown !== null) {
				this.editor.addEvent('keyboard', this.onkeydown.name, [{
					type: 'object',
					string: '[object event]',
					properties: {keyCode: event.keyCode}
				}]);
			}
		},

		keyUp: function(event) {
			// 17 == CTRL, 18 == ALT, (17, 91, 93, 224) == COMMAND, 27 == ESC
			// block these as they are only keyboard shortcuts
			if ([17, 18, 91, 93, 224, 27].indexOf(event.keyCode) >= 0) {
				return;
			}
			if (this.onkeyup !== null) {
				this.editor.addEvent('keyboard', this.onkeyup.name, [{
					type: 'object',
					string: '[object event]',
					properties: {keyCode: event.keyCode}
				}]);
			}
		},

		doInterval: function() {
			this.editor.addEvent('interval', this.interval.name, []);
		},

		clearInterval: function() {
			if (this.intervalId !== null) {
				clearInterval(this.intervalId);
			}
		},

		mouseMove: function(num, event) {
			var onmousemove = this.onmousemove[num];
			if (this.onmousemove[num].timer !== null) {
				onmousemove.lastEvent = event;
			} else {
				this.fireMouseEvent(this.onmousemove[num], event);
				onmousemove.lastEvent = null;
				onmousemove.timer = setTimeout($.proxy(function() {
					onmousemove.timer = null;
					if (onmousemove.lastEvent !== null) {
						this.mouseMove(num, onmousemove.lastEvent);
					}
				}, this), 24);
			}
		},

		mouseDown: function(num, event) {
			this.fireMouseEvent(this.onmousedown[num], event);
		},

		mouseUp: function(num, event) {
			this.fireMouseEvent(this.onmouseup[num], event);
		},

		fireMouseEvent: function(info, event) {
			var offset = info.$element.offset();
			this.editor.addEvent('mouse', info.func.name, [{
				type: 'object',
				string: '[object event]',
				properties: {
					layerX: Math.round(event.pageX-offset.left),
					layerY: Math.round(event.pageY-offset.top),
					pageX: event.pageX,
					pageY: event.pageY
				}
			}]);
		},

		clearMouse: function() {
			for (var i=0; i<this.onmousemove.length; i++) {
				this.onmousemove[i].$element.off('mousemove', this.onmousemove[i].handle);
				this.onmousemove[i].func = this.onmousemove[i].handle = this.onmousemove[i].timer = null;
				this.onmousedown[i].$element.off('mousedown', this.onmousedown[i].handle);
				this.onmousedown[i].func = this.onmousedown[i].handle = null;
				this.onmouseup[i].$element.off('mouseup', this.onmouseup[i].handle);
				this.onmouseup[i].func = this.onmouseup[i].handle = null;
			}
		},

		checkStart: function() {
			if (!this.start) {
				throw 'You an only set events in the first run, not from another event';
			}
		},
		
		outputEndEvent: function() {
			this.first = false;
		},

		outputClearAllEvents: function() {
			this.clearInterval();
			this.clearMouse();
			this.interval = null;
			this.onkeydown = null;
			this.onkeyup = null;
			this.first = true;
			this.popped = false;
		},

		outputPopFirstEvent: function() {
			this.popped = true;
		},

		outputClearEventsFrom: function(eventNum) {
			if (!this.popped && eventNum === 0) {
				this.outputClearAllEvents();
			}
		}
	};
};
