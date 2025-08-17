const fs = require('fs');
const path = require('path');

// 解析命令行参数
const args = process.argv.slice(2);
function getArg(flag, def) {
    const idx = args.findIndex(a => a === flag);
    if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('-')) {
        return args[idx + 1];
    }
    return def;
}

const VIEWBOX_W = parseInt(getArg('-w', '4000'));
const VIEWBOX_H = parseInt(getArg('-h', '3620'));
const MAX_CHARS = parseInt(getArg('-maxsize', '500000'));
const startpy = parseInt(getArg('-starttime', '3000'));
const framerate = parseFloat(getArg('-fps', '5'));
function flipSvgPath(d, height = VIEWBOX_H) { // 支持-h输入
    const tokens = d.match(/-?[0-9]*\.?[0-9]+(?:e[-+]?\d+)?|[MLHVCSQTAZmlhvcsqtaz]|[\s,]+/g) || [];
    const output = [];
    let command = '';
    let params = [];
    const processGroup = (group, isAbsolute) => {
        if (!group.length) return group;
        switch (command) {
            case 'V': return [height - group[0]];
            case 'v': return [-group[0]];
            case 'A': return [group[0], group[1], group[2], group[3], group[4], group[5], height - group[6]];
            case 'a': return [group[0], group[1], group[2], group[3], group[4], group[5], -group[6]];
            default:
                return group.map((val, idx) =>
                    idx % 2 === 1 ? (isAbsolute ? height - val : -val) : val
                );
        }
    };
    const getGroupSize = (cmd) => {
        const upperCmd = cmd.toUpperCase();
        switch (upperCmd) {
            case 'H': case 'h': case 'V': case 'v': return 1;
            case 'M': case 'm': case 'L': case 'l': case 'T': case 't': return 2;
            case 'S': case 's': case 'Q': case 'q': return 4;
            case 'C': case 'c': return 6;
            case 'A': case 'a': return 7;
            case 'Z': case 'z': return 0;
            default: return 0;
        }
    };
    for (const token of tokens) {
        if (token.trim() === '' || token === ',') continue;
        if (/^[MLHVCSQTAZmlhvcsqtaz]$/.test(token)) {
            if (params.length) {
                const groupSize = getGroupSize(command);
                for (let i = 0; i < params.length; i += groupSize) {
                    const group = params.slice(i, i + groupSize);
                    const processed = processGroup(group, command === command.toUpperCase());
                    output.push(processed.join(' '));
                }
                params = [];
            }
            command = token;
            output.push(token);
        } else {
            const num = parseFloat(token);
            if (!isNaN(num)) {
                params.push(num);
            }
        }
    }
    if (params.length) {
        const groupSize = getGroupSize(command);
        for (let i = 0; i < params.length; i += groupSize) {
            const group = params.slice(i, i + groupSize);
            const processed = processGroup(group, command === command.toUpperCase());
            output.push(processed.join(' '));
        }
    }
    return output.join(' ');
}
const formatTime = (ms) => `${`00${Math.floor(ms / 60000)}`.slice(-2)}:${`00${Math.floor((ms % 60000) / 1000)}`.slice(-2)}.${`000${ms % 1000}`.slice(-3)}`;
const randomstr = () => Math.random().toString(16).slice(2, 6).toUpperCase().padStart(4, "0");
function generateSvgText(framerate, startTime, frameNum, color, pathData) {
    if (color == "000000") return "";
    const name = `${frameNum}_${color.replace('#', '')}`;
    const displayTime = (1 / framerate) * 1000;
    const startOffset = (frameNum / framerate) * 1000 - startTime;
    return `  
let p${name} = path{d = "${pathData}" viewBox="0 0 ${VIEWBOX_W} ${VIEWBOX_H}" width = 100% fillColor = 0x${color.replace('#', '')} alpha = 0
borderWidth = 15
    borderColor = 0x${color}
}
set p${name} {} ${Math.floor(startOffset)}ms
then set p${name} {alpha = 1} ${Math.floor(displayTime * 0)}ms
then set p${name} {} ${Math.floor(displayTime)}ms
then set p${name} {alpha = 0} ${Math.floor(displayTime * 0)}ms
`;// viewBox的3、4项使用-w、-h输入
}

// MAX_CHARS、startpy 已由命令行参数控制
const dirPath = 'svgjson';
fs.readdir(dirPath, (err, files) => {
    files.forEach(file => {
        if (path.extname(file) === '.json') {
            const filePath = path.join(dirPath, file);
            fs.readFile(filePath, 'utf8', (err, data) => {
                const jsonData = JSON.parse(data);
                var starttime = jsonData[0].frameIndex * 1000 / framerate;//已改为使用-fps输入

                var filen = 0;
                var out = "";

                jsonData.forEach(e1 => {
                    var bcout = '';
                    e1.data.forEach(e2 => {
                        bcout += generateSvgText(framerate, starttime, e1.frameIndex, e2.color, flipSvgPath(e2.pathdata));//已改为使用-fps输入
                    });
                    if (out.length + bcout.length > MAX_CHARS) {
                        fs.writeFileSync(`${starttime + startpy}_${filen}.txt`, `//${starttime}_${filen}\n` + out, 'utf8');
                        filen++;
                        out = bcout;
                    } else {
                        out += bcout;
                    }
                });

                fs.writeFileSync(`${starttime + startpy}_${filen}.txt`, `//${starttime}_${filen}\n` + out, 'utf8');
            });
        }
    });
});