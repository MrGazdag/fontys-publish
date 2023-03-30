import {Constructor, FontysUploader, setting, UploadOptions} from "../Fontys";
import * as fs from "fs";
import UploadError from "../errors/UploadError";
import * as iconv from "iconv-lite"
import {isText} from "istextorbinary";
import IllegalArgumentError from "../errors/IllegalArgumentError";

/**
 * A named Blob wrapper.
 */
export class NamedBlob {
    blob: Blob;
    name: string;

    /**
     * Creates a new NamedBlob
     * @param {Blob} blob the blob
     * @param {string} name the name
     */
    constructor(blob, name) {
        this.blob = blob;
        this.name = name;
    }
}
export class DirectAdminFileManager {
    client: DirectAdminClient;
    constructor(client: DirectAdminClient) {
        this.client = client;
    }
    async ensureDelete(targetPath: string) {
        if (targetPath.endsWith("/")) targetPath = targetPath.substring(0, targetPath.length-1);
        let index = targetPath.lastIndexOf("/");
        return this.delete(targetPath.substring(0, index), targetPath.substring(index+1));
    }
    async delete(targetParent: string, ...paths: string[]) {
        return new Promise((resolve, reject) => {
            if (!targetParent.startsWith("/")) targetParent = "/" + targetParent;

            let params = new URLSearchParams();
            params.set("chmod", "755");
            params.set("trash", "no");
            params.set("action", "multiple");
            params.set("button", "delete");
            params.set("overwrite", "no")
            params.set("path", targetParent);

            for (let i = 0; i < paths.length; i++) {
                params.set("select" + (i+1), paths[i]);
            }

            fetch(this.client.domain + "/CMD_FILE_MANAGER",{
                method: "POST",
                headers: {
                    "Referer": this.client.domain + "/CMD_FILE_MANAGER" + targetParent,
                    "Cookie": "session=" + this.client.token
                },
                body: params
            }).then(response => {
                if (response.status === 200) {
                    response.text().then(e=>resolve(e));
                } else {
                    reject(new UploadError("Failed to delete files. Unknown reason"));
                }
            }, error => {
                reject(error);
            });
        });
    }
    async ensurePath(targetPath: string) {
        if (targetPath.endsWith("/")) targetPath = targetPath.substring(0, targetPath.length-1);
        let index = targetPath.lastIndexOf("/");
        return this.createDirectory(targetPath.substring(0, index), targetPath.substring(index+1));
    }
    async createDirectory(targetParent: string, folderName: string) {
        return new Promise((resolve, reject) => {
            if (!targetParent.startsWith("/")) targetParent = "/" + targetParent;

            let params = new URLSearchParams();
            params.set("action", "folder");
            params.set("path", targetParent);
            params.set("name", folderName);

            fetch(this.client.domain + "/CMD_FILE_MANAGER",{
                method: "POST",
                headers: {
                    "Referer": this.client.domain + "/CMD_FILE_MANAGER" + targetParent,
                    "Cookie": "session=" + this.client.token
                },
                body: params
            }).then(response => {
                if (response.status === 200) {
                    response.text().then(e=>resolve(e));
                } else {
                    reject(new UploadError("Failed to create folder. Unknown reason"));
                }
            }, error => {
                reject(error);
            });
        });
    }
    async uploadFiles(targetPath: string, files: NamedBlob[]) {
        return new Promise((resolve, reject) => {
            if (!targetPath.startsWith("/")) targetPath = "/" + targetPath;
            let fd = new FormData();
            fd.append("MAX_FILE_SIZE", "10485760");
            fd.append("action", "upload");
            fd.append("path", targetPath);
            for (let i = 0; i < files.length; i++) {
                let f = files[i];
                fd.append("file" + (i+1), f.blob, f.name);
            }
            fetch(this.client.domain + "/CMD_FILE_MANAGER",{
                method: "POST",
                headers: {
                    "Referer": this.client.domain + "/HTM_FILE_UPLOAD?path=" + targetPath,
                    "Cookie": "session=" + this.client.token
                },
                body: fd
            }).then(response => {
                if (response.status === 200) {
                    response.text().then(e=>resolve(e));
                } else {
                    // Failed to upload
                    reject(new UploadError("Failed to upload. Unknown reason"));
                }
            }, error => {
                reject(error);
            });
        });
    }
    /**
     * Reads a file, and returns it as a NamedBlob object.
     * @param path the path to the file
     * @returns the promise with the NamedBlob
     */
    async readAsNamedBlob(path): Promise<NamedBlob> {
        return new Promise((resolve, reject) => {
            fs.readFile(path, null, (err, buffer) => {
                if (err) {
                    reject(err);
                } else {
                    // DirectAdmin (or at least an older version) uses windows-1252 to open text files
                    // If our file is a text file, convert it to windows-1252
                    if (isText(path, buffer)) {
                        resolve(new NamedBlob(new Blob([iconv.encode(buffer.toString(), "win1252")]), path.substring(path.lastIndexOf("/"))));
                    } else {
                        resolve(new NamedBlob(new Blob([buffer]), path.substring(path.lastIndexOf("/"))));
                    }
                }
            });
        });
    }
    async uploadFolder(sourcePath: string, targetPath: string) {
        await this.ensurePath(targetPath);
        let filePromises: Promise<NamedBlob>[] = [];
        await new Promise<void>((resolve)=>{
            fs.readdir(sourcePath, {withFileTypes: true}, (error, files)=>{
                for (let file of files) {
                    if (file.isDirectory()) {
                        this.uploadFolder(sourcePath + "/" + file.name, targetPath + "/" + file.name);
                    } else {
                        // Collect to later upload in a single request
                        filePromises.push(this.readAsNamedBlob(sourcePath + "/" + file.name));
                    }
                }
                resolve();
            });
        });
        let files = await Promise.all(filePromises);
        await this.uploadFiles(targetPath, files);
    }

    /**
     * Reads the files at the specified path, and calls `dirHandler` with the
     * @param path the array
     * @param dirHandler a handler for directories which have been fully read already (includes the root directory as well as subdirectories)
     * @param currentPath the current path in the original directory
     * @returns a promise which will complete when all files have been collected
     */
    async readFilesTree(path: string, dirHandler: (relativePath:string, files: NamedBlob[])=>void, currentPath: string = ""): Promise<void> {
        return new Promise((resolve, reject) => {
            fs.readdir(path, {withFileTypes: true}, (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    let completePromises = [];
                    /**
                     * @type {Promise<NamedBlob>[]}
                     */
                    let filePromises = [];
                    for (let dirent of result) {
                        if (dirent.isDirectory()) {
                            completePromises.push(this.readFilesTree(path + "/" + dirent.name, dirHandler, currentPath + "/" + dirent.name));
                        } else {
                            //filePromises.push(this.readFile(path + "/" + dirent.name));
                        }
                    }
                    completePromises.push(Promise.all(filePromises).then(files=>dirHandler(currentPath, files)));
                    Promise.all(completePromises).then(()=>resolve(), (e)=>reject(e));
                }
            });
        });
    }
}
export class DirectAdminClient {
    domain: string;
    token: string;
    fileManager: DirectAdminFileManager;
    constructor(domain: string) {
        this.domain = domain;
        this.fileManager = new DirectAdminFileManager(this);
    }
    /**
     * Authenticates with the DirectAdmin server.
     * @param username the username to use
     * @param password the password to use
     * @returns a promise which will complete with the session token
     */
    async login(username: string, password: string): Promise<string> {
        return new Promise((resolve, reject) => {
            let params = new URLSearchParams();
            params.set("referer", "/CMD_LOGIN");
            params.set("username", username);
            params.set("password", password);

            fetch(this.domain + "/CMD_LOGIN", {
                redirect: "manual",
                method: "POST",
                headers: {},
                body: params,
                credentials: "include"
            }).then(async response => {
                let cookie = response.headers.get("set-cookie");
                if (!cookie) {
                    // IP has been blacklisted
                    response.text().then((t)=>{
                        if (t.includes("blacklist")) reject(new UploadError("Failed to authenticate. IP has been blacklisted"));
                        else reject(new UploadError("Failed to authenticate. Unknown error"));
                    });
                    return;
                }
                let match = cookie.match(/session=(\S+?);/);
                if (match) {
                    // Success, save it in the cache

                    let token = match[1];
                    /*
                    fs.writeFile(FONTYS_AUTH_CACHE, token, "utf-8",(err)=>{
                        if (err) {
                            console.error("Failed to cache the login token.");
                            console.error(err);
                        } else {
                            console.log("Successful cache")
                        }
                    });
                    */
                    this.token = token;
                    resolve(token);
                } else if (cookie.includes("session=;")) {
                    // Failed to authenticate
                    reject(new UploadError("Failed to authenticate. Wrong username/password?"));
                } else {
                    reject(new UploadError("Failed to authenticate. Unknown reason."));
                }
            }, error => {
                reject(error);
            });
        });
    }

    async verifyToken(token: any) {
        //TODO
        this.token = token;
    }
}
export default class DirectAdminUploader<Options extends DirectAdminOptions> extends FontysUploader<Options> {
    protected readonly client: DirectAdminClient;
    constructor(constructor: Constructor<Options>, domain: string) {
        super("directadmin", constructor);
        this.client = new DirectAdminClient(domain);
    }

    async upload(sourcePath: string, targetPath: string, options: Options) {
        if (options.token) {
            await this.client.verifyToken(options.token);
        } else {
            await this.client.login(options.username, options.password);
        }
        options.logger("Authenticated with DirectAdmin as " + options.username + ".");
        await this.client.fileManager.ensureDelete(targetPath);
        await this.client.fileManager.uploadFolder(sourcePath, targetPath);
    }

}

export class DirectAdminOptions extends UploadOptions {
    @setting({
        description: "The username to use when connecting to DirectAdmin."
    })
    username: string;
    @setting({
        description: "The password to use when connecting to DirectAdmin."
    })
    password: string;
    @setting({
        description: "The session token to use when connecting to DirectAdmin."
    })
    token: string;

    constructor(logger: (message) => void, data: any) {
        super(logger, data);

        if (!this.token) {
            if (!this.username) {
                throw new IllegalArgumentError("Please specify an username, or a token.");
            } else if (!this.password) {
                throw new IllegalArgumentError("Please specify a password.");
            }
        }
    }
}