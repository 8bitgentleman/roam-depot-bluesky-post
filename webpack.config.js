module.exports = {
    externals: {
        react: "React",
        "chrono-node": "ChronoNode",
        '@blueprintjs/core': ['Blueprint', 'Core'],
        '@blueprintjs/select': ['Blueprint', 'Select'],
    },
    externalsType: "window",
    entry: './src/index.js',
    output: {
        filename: 'extension.js',
        path: __dirname,
        library: {
            type: "module",
        }
    },
    experiments: {
        outputModule: true, // This was the missing piece from earlier!
    },
    resolve: {
        extensions: ['.js', '.jsx'],
    },
    module: {
        rules: [
            {
                test: /\.jsx?$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-react']
                    }
                }
            }
        ]
    },
    mode: "production",
};