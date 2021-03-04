/**
 * @license Copyright 2021 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const Fetcher = require('../../gather/fetcher.js');
const Driver = require('../../gather/driver.js');
const Connection = require('../../gather/connections/connection.js');
const {createMockSendCommandFn} = require('../test-utils.js');

/* eslint-env jest */

/** @type {Connection} */
let connectionStub;
/** @type {Driver} */
let driver;
/** @type {Fetcher} */
let fetcher;
/** @type {number} */
let browserMilestone;

beforeEach(() => {
  connectionStub = new Connection();
  driver = new Driver(connectionStub);
  fetcher = new Fetcher(driver);
  browserMilestone = 90;
  driver.getBrowserVersion = jest.fn().mockImplementation(() => {
    return Promise.resolve({milestone: browserMilestone});
  });
});

describe('.fetchResource', () => {
  beforeEach(() => {
    fetcher._enabled = true;
    fetcher._fetchResourceOverProtocol = jest.fn().mockReturnValue(Promise.resolve('PROTOCOL'));
    fetcher._fetchResourceIframe = jest.fn().mockReturnValue(Promise.resolve('IFRAME'));
  });

  it('throws if fetcher not enabled', async () => {
    fetcher._enabled = false;
    const resultPromise = fetcher.fetchResource('https://example.com');
    await expect(resultPromise).rejects.toThrow(/Must call `enable`/);
  });

  it('calls fetchResourceOverProtocol in newer chrome', async () => {
    const result = await fetcher.fetchResource('https://example.com');
    expect(result).toEqual('PROTOCOL');
    expect(fetcher._fetchResourceOverProtocol).toHaveBeenCalled();
    expect(fetcher._fetchResourceIframe).not.toHaveBeenCalled();
  });

  it('calls fetchResourceIframe in chrome before m88', async () => {
    browserMilestone = 87;
    const result = await fetcher.fetchResource('https://example.com');
    expect(result).toEqual('IFRAME');
    expect(fetcher._fetchResourceOverProtocol).not.toHaveBeenCalled();
    expect(fetcher._fetchResourceIframe).toHaveBeenCalled();
  });
});

describe('._fetchResourceOverProtocol', () => {
  /** @type {string} */
  let streamContents;

  beforeEach(() => {
    streamContents = 'STREAM CONTENTS';
    driver.readIOStream = jest.fn().mockImplementation(() => {
      return Promise.resolve(streamContents);
    });
  });

  it('fetches a file', async () => {
    connectionStub.sendCommand = createMockSendCommandFn()
      .mockResponse('Page.getFrameTree', {frameTree: {frame: {id: 'FRAME'}}})
      .mockResponse('Network.loadNetworkResource', {
        resource: {success: true, httpStatusCode: 200, stream: '1'},
      });

    const data = await fetcher._fetchResourceOverProtocol('https://example.com');
    expect(data).toEqual(streamContents);
  });

  it('throws when resource could not be fetched', async () => {
    connectionStub.sendCommand = createMockSendCommandFn()
      .mockResponse('Page.getFrameTree', {frameTree: {frame: {id: 'FRAME'}}})
      .mockResponse('Network.loadNetworkResource', {
        resource: {success: false, httpStatusCode: 404},
      });

    const dataPromise = fetcher._fetchResourceOverProtocol('https://example.com');
    await expect(dataPromise).rejects.toThrowError(/Loading network resource failed/);
  });
});
