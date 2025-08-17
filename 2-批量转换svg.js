const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { program } = require('commander');
const progress = require('cli-progress');

program
    .option('-d, --dir <path>', '要处理的目录路径', './video_frames')
    .option('-c, --concurrency <number>', '并发处理数量', 4)
    .parse(process.argv);

const options = program.opts();

const progressBar = new progress.Bar({
    format: '{bar} | {percentage}% | 已处理: {value}/{total} | 当前: {filename}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
    clearOnComplete: true
});

let fileCount = 0;
let processedCount = 0;

function findPngFiles(dir) {
    const results = [];
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat && stat.isDirectory()) {
            results.push(...findPngFiles(fullPath));
        } else if (path.extname(file).toLowerCase() === '.png') {
            results.push(fullPath);
        }
    });

    return results;
}

async function convertFile(filePath) {
    const dirName = path.dirname(filePath);
    const baseName = path.basename(filePath, '.png');

    const bmpPath = path.join(dirName, `${baseName}.bmp`);
    const svgPath = path.join(dirName, `${baseName}.svg`);

    progressBar.update(processedCount, { filename: `${baseName}.png` });

    try {
        await executeCommand(`magick convert "${filePath}" "${bmpPath}"`);

        await executeCommand(`potrace "${bmpPath}" -s -o "${svgPath}"`);

        fs.unlinkSync(bmpPath);

        return { success: true, file: filePath };
    } catch (error) {
        return { success: false, file: filePath, error };
    }
}

function executeCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(stderr || error.message);
            } else {
                resolve(stdout);
            }
        });
    });
}

async function main() {
    const { default: ora } = await import('ora');
    const spinner = ora('正在扫描目录...').start();

    try {
        const pngFiles = findPngFiles(options.dir);
        fileCount = pngFiles.length;

        if (fileCount === 0) {
            spinner.fail('未找到任何PNG文件');
            process.exit(1);
        }

        spinner.succeed(`找到 ${fileCount} 个PNG文件`);

        console.log('\n');
        progressBar.start(fileCount, 0, { filename: '' });

        const concurrency = parseInt(options.concurrency) || 4;
        const queue = [...pngFiles];
        const active = new Set();
        const results = [];

        while (queue.length > 0 || active.size > 0) {
            if (active.size < concurrency && queue.length > 0) {
                const filePath = queue.shift();
                const promise = convertFile(filePath)
                    .then(result => {
                        active.delete(promise);
                        processedCount++;
                        results.push(result);
                        progressBar.update(processedCount);
                    })
                    .catch(error => {
                        active.delete(promise);
                        processedCount++;
                        results.push({ success: false, file: filePath, error });
                        progressBar.update(processedCount);
                    });

                active.add(promise);
            } else {
                await Promise.race(active);
            }
        }

        progressBar.stop();

        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        console.log('\n');
        console.log('✓ 转换完成!');
        console.log(` 成功: ${successful}`);

        if (failed > 0) {
            console.log(` 失败: ${failed}`);
            console.log('\n失败文件:');

            results.filter(r => !r.success).forEach((result, i) => {
                console.log(`${i + 1}. ${path.relative(options.dir, result.file)}`);
                console.log(` 错误: ${result.error}`);
            });
        }

        console.log('\n');
    } catch (error) {
        spinner.fail('处理过程中发生错误:');
        console.error(error);
        process.exit(1);
    }
}

main();