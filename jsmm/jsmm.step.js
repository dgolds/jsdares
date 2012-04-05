/*jshint node:true*/
"use strict";

module.exports = function(jsmm) {
	require('./jsmm.func')(jsmm);
	require('./jsmm.msg')(jsmm);
	
	jsmm.step = {};
	jsmm.step.Stack = function() { return this.init.apply(this, arguments); };
	jsmm.step.StackElement = function() { return this.init.apply(this, arguments); };
	
	jsmm.step.Stack.prototype = {
		init: function(context, scope) {
			this.context = context;
			this.elements = [new jsmm.step.StackElement(this, context.program, new jsmm.func.Scope(scope))];
			this.executionCounter = 0;
		},
		getLastStackElement: function() {
			if (this.elements.length > 0) {
				return this.elements[this.elements.length-1];
			} else {
				return undefined;
			}
		},
		hasNext: function() {
			return this.getLastStackElement() !== undefined;
		},
		stepNext: function(stack, se) {
			return this.getLastStackElement().element.stepNext(this, this.getLastStackElement());
		},
		// not strictly a pop since it returns the last element instead of the popped element
		up: function(arg) {
			this.elements.pop();
			this.getLastStackElement().args.push(arg);
			return this.getLastStackElement();
		},
		upNext: function(arg) {
			var se = this.up(arg);
			return se.element.stepNext(this, se);
		},
		pushStackElement: function(se) {
			this.elements.push(se);
			return se;
		},
		pushElement: function(el, scope) {
			return this.pushStackElement(new jsmm.step.StackElement(this, el, scope)).element;
		},
		pushStackElementNext: function(se) {
			this.elements.push(se);
			return se.element.stepNext(this, se);
		},
		pushElementNext: function(el, scope) {
			return this.pushStackElementNext(new jsmm.step.StackElement(this, el, scope));
		}
	};
	
	jsmm.step.StackElement.prototype = {
		init: function(stack, element, scope) {
			this.stack = stack;
			this.element = element;
			this.scope = scope;
			this.args = [];
		}
	};
	
	/* statementList */
	jsmm.yy.Program.prototype.stepNext = function(stack, se) {
		switch (se.args.length) {
			case 0:
				stack.executionCounter = 0;
				return stack.pushElementNext(this.statementList, se.scope);
			case 1:
				stack.elements = [];
				return [];
		}
	};
	
	/* statements */
	jsmm.yy.StatementList.prototype.stepNext = function(stack, se) {
		if (jsmm.verbose && se.args.length > 0) {
			console.log('after line ' + this.statements[se.args.length-1].endPos.line + ':');
			console.log(se.scope);
			console.log(' ');
		}
		
		if (se.args.length === 0) {
			stack.executionCounter += this.statements.length+1;
			jsmm.func.checkExecutionCounter(this, stack.executionCounter);
		}
		
		if (se.args.length < this.statements.length) {
			return stack.pushElementNext(this.statements[se.args.length], se.scope);
		} else {
			return stack.upNext(null);
		}
	};
	
	/* statement */
	jsmm.yy.CommonSimpleStatement.prototype.stepNext = function(stack, se) {
		switch (se.args.length) {
			case 0:
				return stack.pushElementNext(this.statement, se.scope);
			case 1:
				return stack.upNext(null);
		}
	};
	
	/* identifier, symbol */
	jsmm.yy.PostfixStatement.prototype.stepNext = function(stack, se) {
		switch (se.args.length) {
			case 0:
				return stack.pushElementNext(this.identifier, se.scope);
			case 1:
				var result = jsmm.func.postfix(this, se.args[0], this.symbol);
				stack.up(null);
				var message = function(f) { return f(se.args[0].name) + ' = ' + f(result.str); };
				return [new jsmm.msg.Inline(this, message), new jsmm.msg.Line(this, message)];
		}
	};
	
	/* identifier, symbol, expression */
	jsmm.yy.AssignmentStatement.prototype.stepNext = function(stack, se) {
		switch (se.args.length) {
			case 0:
				return stack.pushElementNext(this.identifier, se.scope);
			case 1:
				return stack.pushElementNext(this.expression, se.scope);
			case 2:
				var result = jsmm.func.assignment(this, se.args[0], this.symbol, se.args[1]);
				var up = stack.up(result);
				var append = (up.element instanceof jsmm.yy.VarItem);
				var message = function(f) { return f(se.args[0].name) + ' = ' + f(result.str); };
				return [new jsmm.msg.Inline(this, message), new jsmm.msg.Line(this, message, append)];
		}
	};
	
	/* items */
	jsmm.yy.VarStatement.prototype.stepNext = function(stack, se) {
		if (se.args.length === 0) {
			se.args.push(null);
			return [new jsmm.msg.Line(this, ''),
				new jsmm.msg.Continue(this)];
		} else if (se.args.length-1 < this.items.length) {
			return stack.pushElementNext(this.items[se.args.length-1], se.scope);
		} else {
			return stack.upNext(null);
		}
	};
	
	/* name, assignment */
	jsmm.yy.VarItem.prototype.stepNext = function(stack, se) {
		if (this.assignment === null) {
			jsmm.func.varItem(this, se.scope, this.name);
			var ret = stack.upNext(null);
			ret.push(new jsmm.msg.Line(this, 'undefined', true));
			return ret;
		} else {
			switch (se.args.length) {
				case 0:
					jsmm.func.varItem(this, se.scope, this.name);
					return stack.pushElementNext(this.assignment, se.scope);
				case 1:
					return stack.upNext(null);
			}
		}
	};
	
	/* expression */
	jsmm.yy.ReturnStatement.prototype.stepNext = function(stack, se) {
		if (this.expression === null) {
			jsmm.func.funcReturn(this);
			return stack.upNext(null);
		} else {
			switch (se.args.length) {
				case 0:
					return stack.pushElementNext(this.expression, se.scope);
				case 1:
					var lastStackElement = stack.getLastStackElement();
					var result = jsmm.func.funcReturn(this, se.args[0]);
					while (!(lastStackElement.element instanceof jsmm.yy.FunctionCall ||
							lastStackElement.element instanceof jsmm.yy.Program)) {
						lastStackElement = stack.up(result);
					}
					// Postcondition: lastStackElement is a FunctionCall or a Program
					return [new jsmm.msg.Line(this, 'return ' + se.args[0].str),
						new jsmm.msg.Continue(this)];
			}
		}
	};
	
	/* expression1, symbol, expression2 */
	jsmm.yy.BinaryExpression.prototype.stepNext = function(stack, se) {
		switch (se.args.length) {
			case 0:
				return stack.pushElementNext(this.expression1, se.scope);
			case 1:
				return stack.pushElementNext(this.expression2, se.scope);
			case 2:
				var result = jsmm.func.binary(this, se.args[0], this.symbol, se.args[1]);
				stack.up(result);
				var that = this;
				return [new jsmm.msg.Inline(this, function(f) {
					return f(se.args[0].str) + ' ' + that.symbol + ' ' + f(se.args[1].str) + ' = ' + f(result.str);
				})];
		}
	};
	
	/* symbol, expression */
	jsmm.yy.UnaryExpression.prototype.stepNext = function(stack, se) {
		switch (se.args.length) {
			case 0:
				return stack.pushElementNext(this.expression, se.scope);
			case 1:
				var result = jsmm.func.unary(this, this.symbol, se.args[0]);
				stack.up(result);
				var that = this;
				return [new jsmm.msg.Inline(this, function(f) {
					return that.symbol + f(se.args[0].str) + ' = ' + f(result.str);
				})];
		}
	};
	
	/* number */
	jsmm.yy.NumberLiteral.prototype.stepNext = function(stack, se) {
		return stack.upNext(jsmm.func.number(this, this.number));
	};
	
	/* str */
	jsmm.yy.StringLiteral.prototype.stepNext = function(stack, se) {
		return stack.upNext(jsmm.func.string(this, this.str));
	};
	
	/* bool */
	jsmm.yy.BooleanLiteral.prototype.stepNext = function(stack, se) {
		return stack.upNext(jsmm.func.bool(this, this.bool));
	};
	
	/* name */
	jsmm.yy.NameIdentifier.prototype.stepNext = function(stack, se) {
		return stack.upNext(jsmm.func.name(this, se.scope, this.name));
	};
	
	/* identifier, prop */
	jsmm.yy.ObjectIdentifier.prototype.stepNext = function(stack, se) {
		switch (se.args.length) {
			case 0:
				return stack.pushElementNext(this.identifier, se.scope);
			case 1:
				return stack.upNext(jsmm.func.object(this, se.args[0], this.prop));
		}
	};
	
	/* identifier, expression */
	jsmm.yy.ArrayIdentifier.prototype.stepNext = function(stack, se) {
		switch (se.args.length) {
			case 0:
				return stack.pushElementNext(this.identifier, se.scope);
			case 1:
				return stack.pushElementNext(this.expression, se.scope);
			case 2:
				return stack.upNext(jsmm.func.array(this, se.args[0], se.args[1]));
		}
	};
	
	/* identifier, expressionArgs */
	jsmm.yy.FunctionCall.prototype.stepNext = function(stack, se) {
		// calculate function name once all the arguments are known
		if (se.args.length > this.expressionArgs.length) {
			var name = se.args[0].name + '(';
			if (this.expressionArgs.length > 0) name += se.args[1].str;
			for (var i=1; i<this.expressionArgs.length; i++) {
				name += ', ' + se.args[i+1].str;
			}
			name += ')';
		}
		
		var result, up;
		if (se.args.length === 0) {
			return stack.pushElementNext(this.identifier, se.scope);
		} else if (se.args.length < this.expressionArgs.length+1) {
			return stack.pushElementNext(this.expressionArgs[se.args.length-1], se.scope);
		} else if (se.args.length === this.expressionArgs.length+1) {
			se.args.push(null);
			
			return [new jsmm.msg.Inline(this, function(f) {
				return 'calling ' + f(name);
			})];
		} else if (se.args.length === this.expressionArgs.length+2) {
			// first actual function call (all arguments are evaluated)
			result = jsmm.func.funcCall(this, se.args[0], se.args.slice(1, se.args.length-1));
			
			if (result.value !== undefined && result.value[0] !== undefined && result.value[0] instanceof jsmm.msg.Inline) {
				// in this case the local function has been placed on the stack, so no moving up
				return result.value;
			} else {
				up = stack.up(result);
				// fall through
			}
		} else {
			// in case of a user defined function, the result will be pushed on args
			// NOTE: this line is not used entirely correctly, as it is normally
			// called in the context of a function declaration, not a call
			result = jsmm.func.funcWrapResult(this, se.args[0], se.args.pop());
			up = stack.up(result);
			// fall through
		}
		
		if (up.element instanceof jsmm.yy.CallStatement) {
			return [
				new jsmm.msg.Line(this, function(f) { return f(name); }),
				new jsmm.msg.Continue(this)
			];
		} else {
			return [new jsmm.msg.Inline(this, function(f) { return f(name) + ' = ' + f(result.str); })];
		}
	};
	
	/* functionCall */
	jsmm.yy.CallStatement.prototype.stepNext = function(stack, se) {
		switch (se.args.length) {
			case 0:
				return stack.pushElementNext(this.functionCall, se.scope);
			case 1:
				return stack.upNext(null);
		}
	};
	
	/* expression, statementList, elseBlock */
	jsmm.yy.IfBlock.prototype.stepNext = function(stack, se) {
		switch (se.args.length) {
			case 0:
				return stack.pushElementNext(this.expression, se.scope);
			case 1:
				if (jsmm.func.conditional(this, 'if', se.args[0])) {
					return stack.pushElementNext(this.statementList, se.scope);
				} else if(this.elseBlock !== null) {
					return stack.pushElementNext(this.elseBlock, se.scope);
				} else {
					return stack.upNext(null);
				}
				break;
			case 2:
				return stack.upNext(null);
		}
	};
	
	/* ifBlock */
	jsmm.yy.ElseIfBlock.prototype.stepNext = function(stack, se) {
		switch (se.args.length) {
			case 0:
				return stack.pushElementNext(this.ifBlock, se.scope);
			case 1:
				return stack.upNext(null);
		}
	};
	
	/* statementList */
	jsmm.yy.ElseBlock.prototype.stepNext = function(stack, se) {
		switch (se.args.length) {
			case 0:
				return stack.pushElementNext(this.statementList, se.scope);
			case 1:
				return stack.upNext(null);
		}
	};
	
	/* expression, statementList */
	jsmm.yy.WhileBlock.prototype.stepNext = function(stack, se) {
		switch (se.args.length) {
			case 0:
				return stack.pushElementNext(this.expression, se.scope);
			case 1:
				if (jsmm.func.conditional(this, 'while', se.args[0])) {
					return stack.pushElementNext(this.statementList, se.scope);
				} else {
					return stack.upNext(null);
				}
				break;
			case 2:
				se.args.pop(); // pop statementList
				se.args.pop(); // pop expression
				return this.stepNext(stack, se);
		}
	};
	
	/* statement1, expression, statement2, statementList */
	jsmm.yy.ForBlock.prototype.stepNext = function(stack, se) {
		switch (se.args.length) {
			case 0:
				return stack.pushElementNext(this.statement1, se.scope);
			case 1:
				return stack.pushElementNext(this.expression, se.scope);
			case 2:
				if (jsmm.func.conditional(this, 'for', se.args[1])) {
					return stack.pushElementNext(this.statementList, se.scope);
				} else {
					return stack.upNext(null);
				}
				break;
			case 3:
				return stack.pushElementNext(this.statement2, se.scope);
			case 4:
				se.args.pop(); // pop statement2
				se.args.pop(); // pop statementList
				se.args.pop(); // pop expression
				return this.stepNext(stack, se);
		}
	};
	
	/* name, nameArgs, statementList */
	jsmm.yy.FunctionDeclaration.prototype.stepNext = function(stack, se) {
		var that = this;
		
		jsmm.func.funcDecl(this, se.scope, this.name, function() {
			var vars = {};
			for (var i=0; i<that.nameArgs.length; i++) {
				vars[that.nameArgs[i]] = arguments[i];
			}
			var scope = new jsmm.func.Scope(vars, se.scope);
			jsmm.func.funcEnter(that, scope);
			stack.pushStackElement(new jsmm.step.StackElement(stack, that.statementList, scope));
			
			var args = [];
			for(var name in scope.vars) {
				args.push(scope.vars[name].str);
			}
			var message = that.name + '(' + args.join(', ') + ')';
			return [new jsmm.msg.Inline(that, function(f) { return f(message); }),
				new jsmm.msg.Line(that, message)];
		});
		
		return stack.upNext(null);
		/*
		output += 'function' + this.getArgList() + "{\n";
		output += 'var jsmmscopeInner = new jsmm.func.Scope({';
		if (this.nameArgs.length > 0) output += '"' + this.nameArgs[0] + '": ' + this.nameArgs[0];
		for (var i=1; i<this.nameArgs.length; i++) {
			output += ', "' + this.nameArgs[i] + '": ' + this.nameArgs[i];
		}
		output += '}, jsmmscopeOuter);\n';
		output += 'jsmm.func.funcEnter(' + getEl(this) + ');\n';
		if (jsmm.verbose) {
			output += 'console.log("after entering ' + this.name + ':");\n';
			output += 'console.log(jsmmscopeInner);\n';
			output += 'console.log(" ");\n';
		}
		output += this.statementList.stepNext();
		//output += 'return jsmm.func.funcReturn(' + getEl(this) + ');\n';
		output += '});';
		return output;
		*/
	};
};