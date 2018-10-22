const path = require('path');

module.exports = {
	entry: {
		'main':'./src/example.txt'
	},
	output: {
		filename: '[name].js',
		path: path.resolve(__dirname, 'dist')
	},
	module: {
		rules: [/*{
			test: /\.js$/, //如果jsx 就jsx
			exclude: /node_modules/, //禁止编译node_modules文件
			loader: 'babel-loader', //babel-loder
			query: {
				presets: ['env'] //babel-preset-env
			}
		}, */{
			test: /\.txt$/,
			use: {
				loader: path.resolve(__dirname, './loader/myLoader.js'),
				options: {
					name: 'Alice'
				}
			}
		}]
	},
	mode: "development"
};