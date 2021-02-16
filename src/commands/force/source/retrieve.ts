/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as os from 'os';
import { flags, FlagsConfig } from '@salesforce/command';
import { Lifecycle, Messages, SfdxError } from '@salesforce/core';
import { SourceRetrieveResult } from '@salesforce/source-deploy-retrieve';
import { Duration } from '@salesforce/kit';
import { DEFAULT_SRC_WAIT_MINUTES, MINIMUM_SRC_WAIT_MINUTES, SourceCommand } from '../../../sourceCommand';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('@salesforce/plugin-source', 'retrieve');

export class retrieve extends SourceCommand {
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessage('examples').split(os.EOL);
  public static readonly requiresProject = true;
  public static readonly requiresUsername = true;
  public static readonly flagsConfig: FlagsConfig = {
    sourcepath: flags.array({
      char: 'p',
      description: messages.getMessage('flags.sourcePath'),
      exclusive: ['manifest', 'metadata'],
    }),
    wait: flags.minutes({
      char: 'w',
      default: Duration.minutes(DEFAULT_SRC_WAIT_MINUTES),
      min: MINIMUM_SRC_WAIT_MINUTES,
      description: messages.getMessage('flags.wait'),
    }),
    manifest: flags.filepath({
      char: 'x',
      description: messages.getMessage('flags.manifest'),
      exclusive: ['metadata', 'sourcepath'],
    }),
    metadata: flags.array({
      char: 'm',
      description: messages.getMessage('flags.metadata'),
      exclusive: ['manifest', 'sourcepath'],
    }),
    packagenames: flags.array({
      char: 'n',
      description: messages.getMessage('flags.packagename'),
    }),
  };
  protected readonly lifecycleEventNames = ['preretrieve', 'postretrieve'];

  public async run(): Promise<SourceRetrieveResult> {
    const hookEmitter = Lifecycle.getInstance();
    const packages = await this.retrievePackageDirs();
    const defaultPackage = packages.find((pkg) => pkg.default);

    const cs = await this.createComponentSet({
      // safe to cast from the flags as an array of strings
      packagenames: this.flags.packagenames as string[],
      sourcepath: this.flags.sourcepath as string[],
      manifest: this.flags.manifest as string,
      metadata: this.flags.metadata as string[],
    });

    // emit pre retrieve event
    // needs to be a path to the temp dir package.xml
    await hookEmitter.emit('preretrieve', { packageXmlPath: cs.getPackageXml() });

    const results = await cs.retrieve(this.org.getUsername(), this.getAbsolutePath(defaultPackage.path), {
      merge: true,
      // TODO: fix this once wait has been updated in library
      wait: 1000000,
    });

    // emit post retrieve event
    // results must match = {
    //   "done": true,
    //   "fileProperties": [
    //     {
    //       "createdById": "0053B000005FbiuQAC",
    //       "createdByName": "User User",
    //       "createdDate": "2021-02-09T23:48:26.000Z",
    //       "fileName": "unpackaged/classes/MyTest.cls",
    //       "fullName": "MyTest",
    //       "id": "01p3B000008hOVcQAM",
    //       "lastModifiedById": "0053B000005FbiuQAC",
    //       "lastModifiedByName": "User User",
    //       "lastModifiedDate": "2021-02-11T23:00:49.000Z",
    //       "manageableState": "unmanaged",
    //       "type": "ApexClass"
    //     },
    //     {
    //       "createdById": "0053B000005FbiuQAC",
    //       "createdByName": "User User",
    //       "createdDate": "2021-02-09T23:48:27.000Z",
    //       "fileName": "unpackaged/classes/force.cls",
    //       "fullName": "force",
    //       "id": "01p3B000008hOVdQAM",
    //       "lastModifiedById": "0053B000005FbiuQAC",
    //       "lastModifiedByName": "User User",
    //       "lastModifiedDate": "2021-02-11T23:00:49.000Z",
    //       "manageableState": "unmanaged",
    //       "type": "ApexClass"
    //     },
    //     {
    //       "createdById": "0053B000005FbiuQAC",
    //       "createdByName": "User User",
    //       "createdDate": "2021-02-12T17:27:58.876Z",
    //       "fileName": "unpackaged/package.xml",
    //       "fullName": "unpackaged/package.xml",
    //       "id": "",
    //       "lastModifiedById": "0053B000005FbiuQAC",
    //       "lastModifiedByName": "User User",
    //       "lastModifiedDate": "2021-02-12T17:27:58.876Z",
    //       "manageableState": "unmanaged",
    //       "type": "Package"
    //     }
    //   ],
    //   "id": "09S3B000002N5lcUAC",
    //   "status": "Succeeded",
    //   "success": true,
    //   "zipFilePath": "/var/folders/28/dmr8rt4d5f5bq_ttscbspz580000gp/T/sdx_sourceRetrieve_pkg_1613150491146/unpackaged.zip"
    // }
    await hookEmitter.emit('postretrieve', results);

    if (results.status === 'InProgress') {
      throw new SfdxError(messages.getMessage('retrieveTimeout', [(this.flags.wait as Duration).minutes]));
    }
    this.printTable(results, true);

    return results;
  }
}
