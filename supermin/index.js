#!/usr/bin/env node

const program = require('commander');
const path = require('path');
const glob = require("glob");
const fs = require("fs-extra");
const chalk = require('chalk');
const asycn = require('async');
const UglifyJS = require("uglify-js");
const csso = require('csso');
const PngQuant = require('pngquant');
const htmlminify = require('html-minifier').minify;

class Supermin {

    constructor() {
        this.parseArgs();
        this.inputPath = path.resolve(process.cwd(), program.input);
        this.outputPath = path.resolve(process.cwd(), program.output);
        this.keepMusic = program.keepMusic;
        this.inputFiles = [];
        this.size = {
            origin: 0,
            compressed: 0
        };
        this.run();
    }

    parseArgs() {
        program
            .usage('-i /path/to/game/ -o /path/to/out/directory/ [-m]')
            .option('-m, --keep-music', 'keep music resources')
            .option('-i, --input <path>', 'input directory', './')
            .option('-o, --output <path>', 'output directory', './supermin_output')
            .parse(process.argv);
    }

    run() {
        // console.log(this.inputPath);
        // console.log(this.outputPath);
        // console.log(this.keepMusic);
        this.inputFiles = glob.sync(`${this.inputPath}/**/*.*`);
        this.countOriginTotalSizes();
        this.compress(() => {
            this.countCompressedTotalSizes();
            this.finalLog();
        });
    }

    countOriginTotalSizes() {
        let size = 0;
        this.inputFiles.forEach((file) => {
            let stat = fs.statSync(file);
            size += stat.size;
        });
        this.size.origin = size;
    }

    countCompressedTotalSizes() {
        let size = 0;
        glob.sync(`${this.outputPath}/**/*.*`).forEach((file) => {
            let stat = fs.statSync(file);
            size += stat.size;
        });
        this.size.compressed = size;
    }

    compress(done) {
        asycn.eachOfSeries(this.inputFiles, (file, index, cb) => {
            let ext = path.extname(file).toLowerCase();
            process.stdout.write(`[压缩]${file}...`);
            switch (ext) {
                case '.html':
                    this.compressHtml(file, cb);
                    break;
                case '.js':
                    this.compressJs(file, cb);
                    break;
                case '.css':
                    this.compressCss(file, cb);
                    break;
                case '.json':
                    this.compressJson(file, cb);
                    break;
                case '.mp3':
                case '.ogg':
                    this.compressMp3(file, cb);
                    break;
                case '.png':
                    this.compressPng(file, cb);
                    break;
                default:
                    this.compressSkip(file, cb);
                    break;
            }
        }, () => {
            done();
        })
    }

    //压缩js文件
    compressJs(file, cb) {
        let code = fs.readFileSync(file).toString();
        let result = UglifyJS.minify(code, {
            compress: true
        });
        if (result.error) {
            fs.copyFileSync(file, this.getOutputFilePath(file));
            process.stdout.write(chalk.red(`${result.error}\n`));
        }
        else {
            fs.writeFileSync(this.getOutputFilePath(file), result.code);
            process.stdout.write(chalk.green(`OK\n`));
        }
        cb();
    }

    //压缩css文件
    compressCss(file, cb) {
        let code = fs.readFileSync(file).toString();
        let result = csso.minify(code, {

        });
        if (result.error) {
            fs.copyFileSync(file, this.getOutputFilePath(file));
            process.stdout.write(chalk.red(`${result.error}\n`));
        }
        else {
            fs.writeFileSync(this.getOutputFilePath(file), result.css);
            process.stdout.write(chalk.green(`OK\n`));
        }
        cb();
    }

    compressHtml(file, cb) {
        let html = fs.readFileSync(file).toString();
        let result = htmlminify(html, {
            collapseWhitespace: true,
            removeComments: true,
            minifyCSS: true,
            minifyJS: true,
            decodeEntities: true
        });
        fs.writeFileSync(this.getOutputFilePath(file, true), result);
        process.stdout.write(chalk.green(`OK\n`));
        cb();
    }

    compressJson(file, cb) {
        let code = JSON.parse(fs.readFileSync(file).toString());
        fs.writeFileSync(this.getOutputFilePath(file), JSON.stringify(code));
        process.stdout.write(chalk.green(`OK\n`));
        cb && cb();
    }

    compressMp3(file, cb) {
        fs.writeFileSync(this.getOutputFilePath(file), '');
        process.stdout.write(chalk.green(`OK\n`));
        cb && cb();
    }

    //压缩png
    compressPng(file, cb) {
        //const cmd = `${pngquant} 256 --skip-if-larger --force --ext .png "${file}"`;
        let outFile = this.getOutputFilePath(file);
        let myPngQuanter = new PngQuant([256, '--skip-if-larger', '--force', '--nofs', '-']);
        let readStream = fs.createReadStream(file);
        let outStream = fs.createWriteStream(outFile);
        readStream.on('open', () => {
            let tmp = readStream.pipe(myPngQuanter)
                .on('error', (err) => {
                    process.stdout.write(chalk.yellow(`Skip(1)\n`));
                    cb();
                })
                .pipe(outStream)
        });
        outStream
            .on('error', (err) => {
                process.stdout.write(chalk.yellow(`Skip(2)\n`));
                cb();
            })
            .on('finish', () => {
                process.stdout.write(chalk.green(`OK\n`));
                let size1 = fs.statSync(file).size;
                let size2 = fs.statSync(outFile).size;
                if (size2 > size1) {
                    fs.copyFileSync(file, outFile);
                }
                cb();
            })
    }

    compressSkip(file, cb) {
        fs.copyFileSync(file, this.getOutputFilePath(file));
        process.stdout.write(chalk.yellow(`Skip\n`));
        cb && cb();
    }

    finalLog() {
        console.log(chalk.green('\n=========================== 压缩完毕 ==========================='));
        console.log(`原始目录 = ${this.inputPath}`);
        console.log(`输出目录 = ${this.outputPath}`);
        console.log(`原始大小 = ${(this.size.origin / 1024 / 1024).toFixed(2)}MB`);
        console.log(`压缩大小 = ${(this.size.compressed / 1024 / 1024).toFixed(2)}MB`);
        console.log(chalk.green('================================================================'));
    }

    getOutputFilePath(file) {
        let relPath = path.relative(this.inputPath, file);
        let outPath = path.resolve(this.outputPath, relPath);
        fs.ensureFileSync(outPath);
        return outPath
    }

}

new Supermin();