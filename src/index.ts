import "./servers";
import {Fontys, FontysServer, FontysUploader, setting} from "./Fontys";
import IllegalArgumentError from "./errors/IllegalArgumentError";
import * as fs from "fs";
import * as path from "path";
// @ts-ignore
import chalk from "chalk";

interface Logger {
    log(msg);
    close();
}
class ConsoleLogger implements Logger {
    log(msg) {
        console.log(msg);
    }

    close() {}
}
class FileLogger implements Logger {
    static removeRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
    path: string;
    fd: number;
    constructor(path: string, fd: number) {
        this.path = path;
        this.fd = fd;
    }
    log(msg) {
        fs.writeSync(this.fd, (""+msg).replaceAll(FileLogger.removeRegex, ""));
    }

    close() {
        fs.closeSync(this.fd);
    }
}

enum ParseState {
    GLOBAL_VARIABLES,
    SERVER,
    UPLOADER_TYPE,
    UPLOADER_OPTIONS
}

let loggers: Logger[] = [new ConsoleLogger()];
function log(msg) {
    for (let logger of loggers) {
        logger.log(msg);
    }
}
function closeLoggers() {
    for (let logger of loggers) {
        logger.close();
    }
}

console.log();
console.log("Fontys Uploader 1.0.0");
console.log();

const colorError = chalk.red;
const colorGlobalOpts = chalk.magentaBright;
const colorServer = chalk.greenBright;
const colorUploadType = chalk.green;
const colorSource = chalk.yellowBright;
const colorTarget = chalk.yellow;
const colorUploadOpts = chalk.blueBright;

function parse(args) {
    let explicitConsoleLogging = false;
    let helpEnabled = false;
    let server: FontysServer = undefined;
    let uploader: FontysUploader<any> = undefined;
    let uploaderOptions = {};
    let state: ParseState = ParseState.GLOBAL_VARIABLES;
    let source: string = null;
    let target: string = null;
    for (let i = 2; i < args.length; i++) {
        let arg = args[i];
        if (state == ParseState.GLOBAL_VARIABLES) {
            // Parse global settings
            if (arg == "--help") {
                helpEnabled = true;
            } else if (arg.startsWith("--logFile=")) {
                let path = arg.substring("--logFile=".length);
                let fd = fs.openSync(path, "w");
                let logger = new FileLogger(path, fd);
                if (explicitConsoleLogging && loggers.length == 1 && loggers[0] instanceof ConsoleLogger) {
                    loggers = [logger];
                } else {
                    loggers.push(logger);
                }
            } else if (arg == "--log") {
                if (!explicitConsoleLogging && (loggers.length > 1 || loggers[0] instanceof FileLogger)) {
                    loggers.push(new ConsoleLogger());
                }
                explicitConsoleLogging = true;
            } else if (arg.startsWith("--")) {
                console.log(colorError("Unknown global option \"" + arg.substring(2) + "\""));
            } else {
                // Advance state to server mode selection
                state = ParseState.SERVER;
                i--;
            }
        } else if (state == ParseState.SERVER) {
            if (Fontys.doesServerExist(arg)) {
                server = Fontys.getServer(arg);
                if (i == args.length - 1) {
                    // Last argument,
                    uploader = server.getDefaultUploader();
                    state = ParseState.UPLOADER_OPTIONS;
                } else {
                    state = ParseState.UPLOADER_TYPE;
                }
            } else {
                let error = "Unknown server \"" + arg + "\". Possible values: " + Fontys.getServerNames().join(", ");
                if (!helpEnabled) throw new IllegalArgumentError(error);
                console.log(colorError(error));
                break;
            }
        } else if (state == ParseState.UPLOADER_TYPE) {
            if (arg.startsWith("--")) {
                // Use default uploader and advance to next stage
                uploader = server.getDefaultUploader();
                state = ParseState.UPLOADER_OPTIONS;
                i--;
                continue;
            }
            let upl = server.getUploader(arg);
            if (upl != null) {
                uploader = upl;
                state = ParseState.UPLOADER_OPTIONS;
            } else {
                let error = "Server \"" + server.name + "\" has no connection type \"" + arg + "\"! Available uploader types: " + server.getUploaderNames().join(", ");
                if (!helpEnabled) throw new IllegalArgumentError(error);
                console.log(colorError(error));
                break;
            }
        } else if (state == ParseState.UPLOADER_OPTIONS) {
            if (arg.startsWith("--")) {
                arg = arg.substring(2);
            } else if (arg.startsWith("-")) {
                arg = arg.substring(1);
            } else {
                // Parse source or target
                if (source == null) {
                    source = arg;
                } else if (target == null) {
                    target = arg;
                } else {
                    console.log(colorError("Unknown argument \"" + arg + "\""));
                }
                continue;
            }
            let key: string;
            let value: string;
            if (arg.includes("=")) {
                let arr = arg.split("=");
                key = arr[0];
                value = arr[1];
            } else {
                key = arg;
                value = "";
            }
            uploaderOptions[key] = value;
        }
    }

    if (helpEnabled || state != ParseState.UPLOADER_OPTIONS) {
        let execPath = args[1].split(path.sep);
        console.log("Syntax: " + chalk.cyan(execPath[execPath.length-1]) + colorGlobalOpts(" [global options]") + colorServer(" <server>") + colorUploadType(" <upload type>") + colorUploadOpts(" [upload options]"))

        if (state == ParseState.GLOBAL_VARIABLES) {
            console.log(chalk.underline("Global options:"));
            console.log(colorGlobalOpts(" --help") + ": Display this help menu");
            console.log(colorGlobalOpts(" --logFile") + ": Enable logging to a file at the specified path. Can be present multiple times to log to multiple files. Note that this disables console logging by default. You can combine this with \"" + colorGlobalOpts("--log") + "\" to also log to the console.");
            console.log(colorGlobalOpts(" --log") + ": Enable logging to the console, if disabled (" + colorGlobalOpts("--logFile") + " disables this by default)");
        }
        if (state == ParseState.GLOBAL_VARIABLES || state == ParseState.SERVER) {
            console.log(chalk.underline("Servers:"));
            for (let s of Fontys.getServers()) {
                console.log(" - " + colorServer(s.name) + ": " + s.description);
            }
        } else if (state == ParseState.UPLOADER_TYPE) {
            console.log("Uploader types for the \"" + colorServer(server.name) + "\":")
            for (let u of server.getUploaders()) {
                console.log(" - " + colorUploadType(u.name) + (server.getDefaultUploader() == u ? " (default)" : ""));
            }
        } else if (state == ParseState.UPLOADER_OPTIONS) {
            // noinspection JSObjectNullOrUndefined
            console.log("Options of the uploader \"" + colorUploadType(uploader.name) + "\" on server \"" + colorServer(server.name) + "\":");
            for (let option of uploader.getOptions()) {
                let arr = [option.name];
                arr.push(...option.aliases);
                for (let i = 0; i < arr.length; i++) {
                    arr[i] = colorUploadOpts("--" + arr[i]);
                }

                let desc = option.description;
                if (option.required) desc += " Required.";
                if (option.default && option.parser != setting.flag) {
                    desc += " Defaults to ";
                    if (typeof option.default == "string") {
                        desc += "\"" + option.default + "\"";
                    } else {
                        desc += option.default;
                    }
                }
                console.log(" " + arr.join(", ") + ": " + desc);
            }
        }
    } else {
        let opts;
        try {
            // noinspection JSObjectNullOrUndefined
            opts = uploader.parseOptions(log, uploaderOptions);
        } catch (e) {
            log(colorError(e.message));
            return;
        }
        if (source == null) {
            log(colorError("Please enter a source path to copy."))
            return;
        } else if (target == null) {
            log(colorError("Please enter a target path to copy."))
            return;
        }
        if (!fs.existsSync(source)) {
            log(colorError("The source path does not exist!"))
            return;
        }
        log("Uploading to server " + colorServer(server.name) + " using uploader " + colorUploadType(uploader.name) + ".");
        let sourceIsDir = fs.lstatSync(source).isDirectory();
        log("Source " + (sourceIsDir ? "directory" : "file") + ": " + colorSource(source));
        log("Target " + (sourceIsDir ? "directory" : "file") + ": " + colorTarget(target));
        log("");
        uploader.upload(source, target, opts).then(()=>{
            log("");
            log("Upload successfully completed.")
        }, error => {
            log("");
            log(colorError(error));
        });
    }
}
parse(process.argv);
closeLoggers();