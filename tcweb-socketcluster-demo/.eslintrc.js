/**
 * 前端代码规范详见 http://km.oa.com/group/23289/docs/show/176209
 * Guide https://eslint.org/docs/user-guide/configuring
 * @author: initialwu
 * @Date: 2018-03-29 11:07:11
 * @Last Modified by: initialwu
 * @Last Modified time: 2018-03-29 16:39:48
 */
module.exports = {
    root: true,
    parserOptions: {
        ecmaVersion: '2017',
        // 解析器，需安装 babel-eslint
        parser: 'babel-eslint',
        "sourceType": "module",
        // sourceType: module
    },
    env: {
        browser: true,
        es6: true,
        commonjs: true,
        node: true
    },
    extends: [
        // eslint 内置推荐配置
        'eslint:recommended'
    ],
  
    rules: {
        //调试打开
        'no-console': 'off',
        // 使用驼峰命名法变量和参数名
        camelcase: ['error'],
        // 禁止使用未定义的变量，也包括不通过 window 访问自定义的全局变量
        'no-undef': ['error'],
        // 禁止不通过 window 定义全局作用域的变量，即在顶级作用域下定义变量或通过不加 var 来定义一个全局变量
        'no-implicit-globals': ['error'],
        // 禁止定义未被使用的局部变量
        'no-unused-vars': ['warn'],
        // 禁止连续赋值
        'no-multi-assign': ['error'],
       
        // 使用字面量声明 Object 和 Arrary，禁止使用构造函数
        'no-new-object': ['error'],
        'no-array-constructor': ['error'],
        // 使用字面量声明的正则表达式，使用圆括号包裹
        'wrap-regex': ['error'],
        // 不要在非函数代码块里声明函数或变量，但可以使用函数表达式对变量进行赋值
        'no-inner-declarations': ['error'],
        // 无参数调用构造函数时带括号
        'new-parens': ['error'],
        // 链式调用时连续调用两个以上的方法时必须换行
        'newline-per-chained-call': ['error', {
            ignoreChainWithDepth: 2
        }],
        // 使用单引号包裹字符串
        quotes: ['error', 'single'],
        // 双引号包裹字符串
        'jsx-quotes': ['error', 'prefer-double'],
        // 使用四个空格进行缩进，switch-case 块中 case 相对于 switch 缩进一级
        indent: ['error', 4, {
            SwitchCase: 1
        }],
        // 使用one true brace style代码块风格（if-else、try-catch等），if 和 else 和大括号同行
        'brace-style': ['error', '1tbs'],
        // 操作符前后使用一个空格
        'space-infix-ops': 'error',
        // if else 等关键字前后使用空格
        'keyword-spacing': ['error'],
        // 行内代码块的开括号后和闭括号前使用空格
        'block-spacing': ['error', 'never'],
        // 逗号后使用空格，逗号前不使用空格
        'comma-spacing': ['error', {
            before: false,
            after: true
        }],
        // 在行尾使用逗号，禁止在行首使用逗号
        'comma-style': ['error', 'last'],
        // 使用拖尾换行：非空文件末尾增加一行空行
        'eol-last': ['error', 'always'],
        // 禁止使用 CRLF 换行，仅使用 LF (\n) 换行
        'linebreak-style': ['error', 'unix'],
        // 强制行尾使用分号
        semi: ['error', 'always'],
        // 禁止行尾出现无意义空格
        'no-trailing-spaces': ['error'],
        // 禁止出现连续空行
        'no-multiple-empty-lines': ['error', {
            max: 1,
            maxEOF: 1
        }],
        // 块注释 /** */前换行
        'lines-around-comment': ['error', {
            beforeBlockComment: true
        }],
        // 开发环境编译时允许 debugger
        'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off'
    }
}