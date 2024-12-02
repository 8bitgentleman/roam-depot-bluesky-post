import { Alert, Menu, MenuItem, Popover, Button, Position } from "@blueprintjs/core";
import React from "react";

const MyAlert = ({ onClose, isOpen, onConfirm, options, defaultValue }) => {
  const [selectedValue, setSelectedValue] = React.useState(defaultValue);

  const handleMenuItemClick = (option) => {
    setSelectedValue(option);
  };

  const handleConfirm = () => {
    onConfirm(selectedValue);
    onClose();
  };

  const menu = (
    <Menu>
      {options.map((option) => (
        <MenuItem text={option.name} onClick={() => handleMenuItemClick(option)} key={option.name} />
      ))}
    </Menu>
  );

  return (
    <Alert
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleConfirm}
      cancelButtonText="Cancel"
      confirmButtonText="Send"
    >
      <h4>Select a graph to send to</h4>
      <Popover content={menu} position={Position.BOTTOM} minimal={true}>
        <Button text={selectedValue ? selectedValue.name : "Select an option"} />
      </Popover>
    </Alert>
  );
};

export default MyAlert;