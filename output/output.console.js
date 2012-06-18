/*jshint node:true jquery:true*/
"use strict";

module.exports = function(output) {
	output.Console = function() { return this.init.apply(this, arguments); };

	output.Console.prototype = {
		init: function($div, editor) {
			this.$div = $div;
			this.$div.addClass('output console');
			this.$div.on('scroll', $.proxy(this.refreshAutoScroll, this));

			this.$container = $('<div class="console-container"></div>');
			this.$div.append(this.$container);

			this.$targetConsole = $('<div class="console-target"></div>');
			this.$container.append(this.$targetConsole);

			this.$content = $('<div class="console-content"></div>');
			this.$container.append(this.$content);

			this.$old = $('<div class="console-old"></div>');
			this.$content.append(this.$old);

			this.$lines = $('<div class="console-lines"></div>');
			this.$content.append(this.$lines);

			this.$mirror = $('<div></div>');

			//this.debugToBrowser = true;
			this.highlighting = false;
			this.autoScroll = true;
			this.editor = editor;

			this.refreshAutoScroll();
		},

		remove: function() {
			this.$lines.children().remove();
			this.$container.remove();
			this.$mirror.remove();
			this.$div.removeClass('output console');
			this.$div.off('scroll mousemove mouseleave');
		},

		getAugmentedObject: function() {
			return {
				type: 'object',
				string: '[object console]',
				properties: {
					log: {
						name: 'log',
						info: 'console.log',
						type: 'function',
						example: 'log("Hello World!")',
						string: '[function console.log]',
						func: $.proxy(this.log, this),
						cost: 3
					},
					clear: {
						name: 'clear',
						info: 'console.clear',
						type: 'function',
						example: 'clear()',
						string: '[function console.clear]',
						func: $.proxy(this.clear, this),
						cost: 4
					},
					setColor: {
						name: 'setColor',
						info: 'console.setColor',
						type: 'function',
						example: 'setColor("#a00")',
						string: '[function console.setColor]',
						func: $.proxy(this.setColor, this),
						cost: 0.2
					}
				}
			};
		},

		log: function(context, name, args) {
			var value = args[0];
			var text = '' + value;
			if (typeof value === 'object') text = value.string;
			else if (value === undefined) text = '';

			this.text += text + '\n';

			var $element = $('<div class="console-line"></div>');
			$element.text(text);
			$element.css('color', this.color);
			$element.data('index', this.currentEvent.calls.length);
			$element.data('event', this.currentEvent);
			$element.addClass('console-line-visible');
			this.$lines.append($element);

			var $mirrorElement = $element.clone();
			this.$mirror.append($mirrorElement);
			
			this.currentEvent.calls.push({
				$element: $element,
				stepNum: context.getStepNum(),
				nodeId: context.getCallNodeId()
			});
			
			if (this.currentEvent.$firstElement === null) {
				this.currentEvent.$firstElement = $element;
				this.currentEvent.$firstMirrorElement = $mirrorElement;
			}

			if (this.autoScroll) {
				this.scrollToY(this.$content.height());
			}

			if (this.debugToBrowser && console && console.log) console.log(value);
		},

		clear: function(context) {
			this.text = '';
			this.color = '';
			this.$mirror.html('');
			this.$old.hide();
			this.$lines.children('.console-line-visible').removeClass('console-line-visible');

			this.currentEvent.calls.push({
				clear: true,
				stepNum: context.getStepNum()
			});
			
			if (this.debugToBrowser && console && console.clear) console.clear();
		},

		setColor: function(context, name, args) {
			var color = args[0];
			this.color = color;
		},

		outputStartEvent: function(context) {
			this.currentEvent = {
				text: this.text,
				color: this.color,
				$firstElement: null,
				$firstMirrorElement: null,
				oldHtml: this.$mirror.html(),
				calls: []
			};
			this.events.push(this.currentEvent);
		},

		outputEndEvent: function() {
			this.updateEventHighlight();
		},

		stashOldLines: function() {
			if (!this.oldLinesStashed) {
				this.oldLinesStashed = true;
				this.$old.html(this.events[0].oldHtml);
				if (this.events[0].$firstElement !== null) {
					this.events[0].$firstElement.prevAll().remove();
				} else {
					this.$lines.children().remove();
				}
			}
		},

		outputClearAllEvents: function() {
			this.text = '';
			this.color = '';
			this.$mirror.html('');
			this.$old.html('');
			this.$old.show();
			this.oldLinesStashed = true;
			this.$lines.children().remove(); // prevent $.data leaks
			this.events = [];
		},

		outputPopFirstEvent: function() {
			this.events.shift();
			this.oldLinesStashed = false;
		},

		outputClearEventsFrom: function(eventNum) {
			this.stashOldLines();

			this.text = this.events[eventNum].text;
			this.color = this.events[eventNum].color;
			for (var i=eventNum; i<this.events.length; i++) {
				if (this.events[i].$firstElement !== null) {
					this.events[i].$firstElement.nextAll().remove();
					this.events[i].$firstElement.remove();
					this.events[i].$firstMirrorElement.nextAll().remove();
					this.events[i].$firstMirrorElement.remove();
					break;
				}
			}
			this.events = this.events.slice(0, eventNum);
		},

		outputClearEventsToEnd: function() {
			this.$old.html(this.$mirror.html());
			this.$old.show();
			this.oldLinesStashed = true;
			this.$lines.children().remove(); // prevent $.data leaks
			this.events = [];
		},

		outputSetError: function(error) {
			if (error) {
				this.$content.addClass('console-error');
			} else {
				this.$content.removeClass('console-error');
			}
		},

		outputSetEventStep: function(eventNum, stepNum) {
			this.stashOldLines();
			this.currentEvent = this.events[eventNum];

			this.$old.show();
			this.$lines.children('.console-line-visible').removeClass('console-line-visible');
			for (var i=0; i<this.events.length; i++) {
				if (i > eventNum) break;
				for (var j=0; j<this.events[i].calls.length; j++) {
					var call = this.events[i].calls[j];
					if (i === eventNum && call.stepNum > stepNum) break;

					if (call.clear) {
						this.$old.hide();
						this.$lines.children('.console-line-visible').removeClass('console-line-visible');
					} else {
						call.$element.addClass('console-line-visible');
					}
				}
			}

			this.updateEventHighlight();

			if (this.autoScroll) {
				this.scrollToY(this.$content.height());
			}
		},

		highlightCallNodes: function(nodeIds) {
			this.$lines.children('.console-line-highlight-line').removeClass('console-line-highlight-line');

			for (var i=0; i<this.currentEvent.calls.length; i++) {
				var call = this.currentEvent.calls[i];
				if (nodeIds.indexOf(call.nodeId) >= 0 && !call.clear) {
					call.$element.addClass('console-line-highlight-line');
				}
			}

			var $last = this.$lines.children('.console-line-highlight-line').last();
			if ($last.length > 0) {
				// the offset is weird since .position().top changes when scrolling
				this.scrollToY($last.position().top, true);
			}
		},

		highlightTimeNodes: function(timeNodes) {
			this.$lines.children('.console-line-highlight-time').removeClass('console-line-highlight-time');
			if (timeNodes !== null) {
				for (var i=0; i<this.events.length; i++) {
					for (var j=0; j<this.events[i].calls.length; j++) {
						var call = this.events[i].calls[j];

						if (timeNodes[i].indexOf(call.nodeId) >= 0 && !call.clear) {
							call.$element.addClass('console-line-highlight-time');
						}
					}
				}
			}
		},

		enableHighlighting: function() {
			this.highlighting = true;
			this.$div.addClass('console-highlighting');
			this.$div.on('mousemove', $.proxy(this.mouseMove, this));
			this.$div.on('mouseleave', $.proxy(this.mouseLeave, this));
			this.autoScroll = false;
			this.$div.removeClass('console-autoscroll');
			this.updateEventHighlight();
		},

		disableHighlighting: function() {
			this.highlighting = false;
			this.$lines.children('.console-line-highlight-line').removeClass('console-line-highlight-line');
			this.updateEventHighlight();
			this.$div.removeClass('console-highlighting');
			this.$div.off('mousemove mouseleave');
			this.refreshAutoScroll();
		},

		updateEventHighlight: function() {
			this.$lines.children('.console-line-highlight-event').removeClass('console-line-highlight-event');
			if (this.highlighting) {
				for (var i=0; i<this.currentEvent.calls.length; i++) {
					if (!this.currentEvent.calls[i].clear) {
						this.currentEvent.calls[i].$element.addClass('console-line-highlight-event');
					}
				}
			}
		},

		getText: function() {
			return this.text;
		},

		makeTargetConsole: function(content) {
			var lines = content.split('\n');
			while (lines.length > 0 && lines[lines.length-1] === '') {
				lines.pop();
			}
			for (var i=0; i<lines.length; i++) {
				var $element = $('<div class="console-line"></div>');
				$element.text(lines[i]);
				this.$targetConsole.append($element);
			}
		},

		setFocus: function() {
			this.$content.css('min-height', this.$targetConsole.height());
			this.refreshAutoScroll();
		},

		getMouseElement: function() {
			return this.$container;
		},

		/// INTERNAL FUNCTIONS ///
		scrollToY: function(y, smooth) {
			smooth = smooth || false;
			y = Math.max(0, y - this.$div.height()/2);
			this.$div.stop(true);
			if (smooth) {
				this.$div.animate({scrollTop : y}, 150);
			} else {
				this.$div.scrollTop(y);
			}
		},

		mouseMove: function(event) {
			if (this.highlighting) {
				var $target = $(event.target);
				if ($target.data('event') === this.currentEvent && this.currentEvent.calls[$target.data('index')] !== undefined) {
					if (!$target.hasClass('console-line-highlight-line')) {
						this.$lines.children('.console-line-highlight-line').removeClass('console-line-highlight-line');
						$target.addClass('console-line-highlight-line');
						this.editor.highlightNodeId(this.currentEvent.calls[$target.data('index')].nodeId);
					}
				} else {
					this.$lines.children('.console-line-highlight-line').removeClass('console-line-highlight-line');
					this.editor.highlightNodeId(0);
				}
			}
		},

		mouseLeave: function(event) {
			if (this.highlighting) {
				this.$lines.children('.console-line-highlight-line').removeClass('console-line-highlight-line');
				this.editor.highlightNodeId(0);
			}
		},

		refreshAutoScroll: function() {
			if (!this.highlighting) {
				if (this.$div.scrollTop() >= this.$content.outerHeight(true)-this.$div.height()-4 || this.$div.height() <= 0) {
					this.$div.addClass('console-autoscroll');
					this.autoScroll = true;
				} else {
					this.$div.removeClass('console-autoscroll');
					this.autoScroll = false;
				}
			}
		}
	};
};
