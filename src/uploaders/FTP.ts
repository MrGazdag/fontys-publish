import * as ftp from "basic-ftp";
import {Constructor, FontysUploader, setting, UploadOptions} from "../Fontys";
import UploadError from "../errors/UploadError";
import * as fs from "fs";

export default class FTPUploader<Options extends FTPOptions> extends FontysUploader<Options> {
    constructor(options: Constructor<Options>) {
        super("ftp", options);
    }
    cannotConnect(host, port, error) {
        throw new UploadError("Could not establish a connection to \"" + host + ":" + port + "\":", error);
    }
    protected async connectClient(client: ftp.Client, options: FTPOptions) {
        if (options.verbose) {
            client.ftp.verbose = options.verbose;
        }

        // let host = this.defaultHost;
        try {
            await client.access({
                host: options.ftpHost,
                port: options.ftpPort,
                user: options.username,
                password: options.password,
                secure: false
            });
        } catch (e) {
            this.cannotConnect(options.ftpHost, options.ftpPort, e)
        }
    }
    protected async uploadImpl(client: ftp.Client, sourcePath: string, targetPath: string) {
        if (fs.statSync(sourcePath).isDirectory()) {
            await client.ensureDir(targetPath);
            await client.clearWorkingDir();
            await client.uploadFromDir(sourcePath);
            await client.cdup();
        } else {
            await client.remove(targetPath, true);
            await client.uploadFrom(sourcePath, targetPath);
        }
    }
    async upload(sourcePath: string, targetPath: string, options?: FTPOptions) {
        let client = new ftp.Client();
        await this.connectClient(client, options);
        options.logger("Connected.")

        // Recreate folder
        options.logger("Uploading...")
        await this.uploadImpl(client, sourcePath, targetPath);

        options.logger((fs.statSync(sourcePath).isDirectory() ? "Directory" : "File") + " uploaded.")
        await client.close();
    }
}
export class FTPOptions extends UploadOptions {
    @setting({
        description: "The username to use when logging into the FTP server.",
        required: true
    })
    username: string;
    @setting({
        description: "The password to use when logging into the FTP server.",
        required: true
    })
    password: string;

    @setting({
        description: "Enables verbose logging from the library.",
        default: false,
        parser: setting.flag
    })
    verbose: boolean;
    @setting({
        description: "The host to connect to."
    })
    ftpHost: string;
    @setting({
        description: "The port to connect to.",
        default: 21,
        parser: setting.int
    })
    ftpPort: number;
}