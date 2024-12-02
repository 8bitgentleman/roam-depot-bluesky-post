import React, { useState, useEffect } from 'react';
import { FormGroup, InputGroup, Switch } from "@blueprintjs/core";

const SETTING_NAME_TOGGLE = 'appendDate';
const SETTING_NAME_TEMPLATE = 'appendTemplate';
const DEFAULT_TEMPLATE = 'sent on {DATE}';

const DateAppendSetting = (extensionAPI) => {
    return () => {
        const [toggle, setToggle] = useState(extensionAPI.settings.get(SETTING_NAME_TOGGLE) || false);
        const [template, setTemplate] = useState(extensionAPI.settings.get(SETTING_NAME_TEMPLATE) || DEFAULT_TEMPLATE);

        useEffect(() => {
            extensionAPI.settings.set(SETTING_NAME_TOGGLE, toggle);
        }, [toggle, extensionAPI]);

        useEffect(() => {
            extensionAPI.settings.set(SETTING_NAME_TEMPLATE, template);
        }, [template, extensionAPI]);

        const handleToggle = () => {
            setToggle(!toggle);
        };

        const handleTemplateChange = (event) => {
            setTemplate(event.target.value);
        };

        return (
            <div>
                <Switch 
                    checked={toggle} 
                    label="Append Post Date" 
                    onChange={handleToggle} 
                />
                <FormGroup
                    label="Date Template"
                    labelInfo="(use {DATE} as placeholder)"
                    labelFor="template-input"
                >
                    <InputGroup 
                        id="template-input" 
                        disabled={!toggle} 
                        value={template} 
                        onChange={handleTemplateChange} 
                        placeholder={DEFAULT_TEMPLATE}
                        fill={false}
                        style={{width: '300px', opacity: toggle ? 1 : 0.5}}
                    />
                </FormGroup>
            </div>
        );
    };
};

export default DateAppendSetting;