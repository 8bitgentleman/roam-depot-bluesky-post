import { Button, InputGroup, Divider } from "@blueprintjs/core";
import React, { useState, useEffect } from "react";

const BlueskyLoginPanel = (extensionAPI) => () => {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loginInfo, setLoginInfo] = useState(null);

    useEffect(() => {
        const fetchLoginInfo = async () => {
            const savedLoginInfo = await extensionAPI.settings.get("loginInfo");
            setLoginInfo(savedLoginInfo);
        };

        fetchLoginInfo();
    }, []);

    const addLogin = (newLogin) => {
        // Since we only want one login, we directly set it
        extensionAPI.settings.set("loginInfo", newLogin);
        setLoginInfo(newLogin);
    };

    const deleteLogin = () => {
        // Remove the login from state and settings
        extensionAPI.settings.set("loginInfo", null);
        setLoginInfo(null);
    };

    return (
        <div className="flex flex-col w-full">
            <div>
                {loginInfo && (
                    <div className="flex justify-between items-center">
                        <span>{loginInfo.username}</span>
                        <Button
                            icon="trash"
                            minimal
                            onClick={deleteLogin}
                        />
                    </div>
                )}
            </div>
            <Divider />
            {!loginInfo && (
                <ul  style={{paddingLeft:"0"}}>

                    {/* <li className="flex justify-center mt-4">

                    </li> */}


                    <li class="input-group">
                        <InputGroup
                            placeholder="Bluesky Username"
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </li>
                    <li class="input-group">
                        <InputGroup
                            placeholder="Password"
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </li>
                    <li className="input-group" style={{ marginTop: "8px" }}>
                        <Button
                            icon="plus"
                            minimal
                            onClick={() => {
                                const newLogin = {
                                    username: username,
                                    password: password,
                                };
                                addLogin(newLogin);
                                // Reset the input fields
                                setUsername("");
                                setPassword("");
                                console.log(newLogin);
                                
                            }}
                        />
                    </li>
                </ul>

            )}
        </div>
    );
};

export default BlueskyLoginPanel;