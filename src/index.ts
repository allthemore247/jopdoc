import joplin from 'api';
import { FileSystemItem } from 'api/types';
import { exec } from 'child_process';
import { join } from 'path';
import { promisify } from 'util';

const fs = require("fs-extra");
const path = require('path');

function destDir(context:any) {
	return context.destPath;
}

function resourceDir(context:any) {
	return context.destPath + '/resources';
}

// used when the resources for the document don't need to stay
function tempResourceDir() {
	return process.env.TEMP + '/jopdoc-resources';
}

joplin.plugins.register({
	onStart: async function() {
		console.log("Jopdoc registered...");
		const tempFiles = [];

		await joplin.interop.registerExportModule({
			description: 'Word Document Export',
			format: 'docx',
			target: FileSystemItem.Directory,
			isNoteArchive: false,

			onInit: async (context:any) => {
				await fs.mkdirp(destDir(context));
				await fs.mkdirp(tempResourceDir);
			},

			onProcessItem: async (context:any, _itemType:number, item:any) => {
				if (_itemType == 1) { // only get notes
					// create the destination directory
					const title =  item.title.replace(/ /g, "_").replace(/\./g, "");
					const outFilePath = join(destDir(context), title + '.docx');
					console.info('Jopdoc - Exporting to: ' + outFilePath);
					
					// fix the text to resolve all images to the correct directory
					// todo jpg - perhaps go check the temp resource dir, find matching id, then replace this match with the found file extension?
					let text = item.body.replace(/\!\[\]\(\:\/[0-9a-f]{32}/g, match => match + '.png'); 
					text = text.replace(/\!\[\]\(\:/g, '![](' + tempResourceDir());

					// create temporary input file from joplin note (github flavored md)
					const tempInputPath = join(process.env.TEMP, `temp-${title}.md`);
					await fs.writeFile(tempInputPath, text);
					tempFiles.push(tempInputPath); // push to delete later

					// convert to file path
					const promisedExec = promisify(exec)
					try {
						const { stdout, stderr } = await promisedExec(`pandoc -f gfm -t docx -o ${outFilePath} ${tempInputPath}`);
						console.log(`Jopdoc - ${title} exported!`);
					} catch (error) {
						console.error(`Jopdoc - ${error.name}: ${error.message}`);
					}
				}
			},

			onProcessResource: async (context:any, _resource:any, filePath:string) => {
				const destPath = join(tempResourceDir(), path.basename(filePath));
				await fs.copy(filePath, destPath);
				tempFiles.push(destPath);
			},

			onClose: async (_context:any) => {
				// unlink and delete all temporary files used in this export
				for (let entry of tempFiles) {
					fs.unlink(entry);
				}
			},
		})
	},
});
