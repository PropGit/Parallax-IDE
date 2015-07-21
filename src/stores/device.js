'use strict';

const _ = require('lodash');

const alt = require('../alt');

const { connected, disconnected, rx, tx } = require('../actions/transmission');
const { hideDownload, showDownload } = require('../actions/overlay');
const { clearOutput, output } = require('../actions/console');
const { enableAuto, disableAuto, reloadDevices, updateSelected } = require('../actions/device');

class DeviceStore {
  constructor() {

    this.bindListeners({
      onReloadDevices: [reloadDevices, showDownload],
      onDisableAuto: disableAuto,
      onEnableAuto: enableAuto,
      onUpdateSelected: updateSelected
    });

    this.state = {
      auto: true,
      devices: [],
      devicePath: null,
      message: null,
      progress: 0,
      searching: true,
      selectedDevice: null
    };

    this.messages = {
      none: 'No BASIC Stamps found.',
      noneMatched: 'No matching BASIC Stamps found.',
      multiple: 'Please select which module to download to.'
    };
  }

  onDisableAuto() {
    this.setState({ auto: false });
  }

  onEnableAuto(){
    this.setState({ auto: true });
  }

  onReloadDevices(){

    const { scanBoards, workspace } = this.getInstance();
    const { auto } = this.state;
    const { content } = workspace.getState();

    const scanOpts = {
      reject: [
        /Bluetooth-Incoming-Port/,
        /Bluetooth-Modem/,
        /dev\/cu\./
      ],
      source: content
    };

    this.setState({
      devicePath: null,
      message: null,
      searching: true
    });

    scanBoards(scanOpts)
      .then((devices) => this.setState({ devices: devices, searching: false }))
      .then(() => {
        if(auto) {
          this._checkDevices();
        }
    });
  }

  onUpdateSelected(device) {

    const { workspace, documents } = this.getInstance();
    const { noneMatched } = this.messages;
    const { content } = workspace.getState();

    if(this.state.message === noneMatched) {

      const { name } = device;
      const { TargetStart } = device.program.raw;
      const end = content.indexOf('}', TargetStart);

      const pre = content.substring(0, TargetStart);
      const post = content.substring(end, content.length);
      const newSource = pre + name + post;

      documents.update(newSource);
      workspace.updateContent(newSource);
    }

    this.setState({
      devicePath: device.path,
      selectedDevice: device,
      message: null
    });

    this._download();
  }

  _checkDevices(){
    const { auto, devices } = this.state;
    const { none, noneMatched, multiple } = this.messages;
    let matchedDevices = [];
    let exists = false;

    _.forEach(devices, (device) => {
      if (device.match) {
        matchedDevices.push(device);
      }
      if (device.name) {
        exists = true;
      }
    });

    if (!exists) {

      this.setState({ message: none });

    } else if (matchedDevices.length === 0) {

      this.setState({ message: noneMatched });

    } else if(matchedDevices.length === 1) {

      this.setState({
        message: null,
        selectedDevice: matchedDevices[0]
      });

      if (auto) {
        this._download();
      }

    } else {

      this.setState({ message: multiple });

    }

  }

  _download() {

    function updateProgress(progress){
      this.setState({ progress: progress });
    }

    const { workspace, getBoard } = this.getInstance();
    const { selectedDevice } = this.state;
    const { filename, content } = workspace.getState();

    if(!selectedDevice){
      return;
    }

    const board = getBoard(selectedDevice);

    board.removeListener('terminal', output);
    board.removeListener('terminal', rx);
    board.removeListener('close', disconnected);

    board.on('progress', updateProgress.bind(this));
    board.on('progress', tx.bind(this));

    board.bootload(content)
      .tap(() => clearOutput())
      .then(() => board.on('terminal', output))
      .then(() => board.on('terminal', rx))
      .tap(() => board.on('close', disconnected))
      .tap(() => this._handleClear())
      .tap(() => this._handleSuccess(`'${filename}' downloaded successfully`))
      .catch((err) => this._handleError(err))
      .finally(() => {
        board.removeListener('progress', updateProgress);
        this.setState({ progress: 0 });
        connected();
        hideDownload();
      });
  }

  _handleClear(){
    const { toasts } = this.getInstance();

    toasts.clear();
  }

  _handleError(err){
    const { toasts } = this.getInstance();

    toasts.error(err);
  }

  _handleSuccess(msg){
    const { toasts } = this.getInstance();

    toasts.success(msg);
  }

}

DeviceStore.config = {
  stateKey: 'state'
};

module.exports = alt.createStore(DeviceStore);
