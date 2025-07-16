function guid() {
        return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random()*16|0,
                v = c == 'x' ? r : (r&0x3|0x8);
            return v.toString(16);
        });
    }

document.getElementById('importForm').addEventListener('submit', function(event) {  
    event.preventDefault(); // Prevent form submission  
	 var fileInput = document.createElement('input');
    fileInput.setAttribute('type', 'file');
    fileInput.setAttribute('accept', '.json');
	
    // 当用户选择了文件时触发change事件
    fileInput.onchange = function(event) {
   // var fileInput = document.getElementById('jsonFileInput');  
    var file = event.target.files[0]; // Get the selected file  
    var reader = new FileReader(); // Create a FileReader to read the contents of the file  
	document.title=file.name;
    reader.onload = function(event) {  
        var jsonContent = JSON.parse(event.target.result); // Parse the JSON content from the file  
        var buttonsContainer = document.getElementById('buttonsContainer'); // Get the container where buttons will be appended  
        buttonsContainer.innerHTML = ''; // Clear any previous buttons  
		jsonContent.buttons.forEach(function(button) {   
			var  id = guid();  				  
			var buttonElement = document.createElement('button');   
			buttonElement.className = 'button';   
			buttonElement.style.marginRight='6px'
			// buttonElement.style.fontSize = '16px'; 
			buttonElement.textContent = button.name;
			buttonElement.command = button.command; // 添加一个"command"属性，用于存储JSON中的"command"字段  
			buttonElement.param = button.param; // 添加一个"param"属性，用于存储JSON中的"param"字段  
			buttonElement.jsonparam = button.jsonparam; // 用于自定义的param	
			buttonElement.id = id;
			buttonElement.editparam = button.editparam; // 用于自定义的param		
			buttonElement.arrayeditparam = button.arrayeditparam; // 用于自定义的param		
			buttonElement.addEventListener('click', function() {  
				var nTimeout = 0;
				// 自动打开连接
				if (document.getElementsByClassName("btn-success")[0] != undefined) {
					document.getElementsByClassName("btn-success")[0].click();
					nTimeout = 200;
				}

				var timeoutId = setTimeout(function() {  
					model="{\"action\": \"%1%\",\"param\": %2%,\"uuid\": \"1234567890\"}";
					strSenddata=model.replace(/%1%/g, buttonElement.command);
					// 看看有没有自定义的edit
					var jsonedit = buttonElement.jsonparam;
					var editctr = buttonElement.editparam;
					var array = buttonElement.arrayeditparam;
					var content = document.getElementById("input" + buttonElement.id);
					if (jsonedit != null) 
						strSenddata=strSenddata.replace(/%2%/g,  content.value);				
					else if (editctr != null) 
						strSenddata=strSenddata.replace(/%2%/g, "\"" + content.value + "\"");
					else if(array != null) 
						strSenddata=strSenddata.replace(/%2%/g, "[" + content.value + "]");
					else 
						strSenddata=strSenddata.replace(/%2%/g, "\"" + buttonElement.param + "\"");
					// console.log(strSenddata);
					buttonElement.SendDataStr=strSenddata;
					Vm.sendData(buttonElement.SendDataStr);
				}, nTimeout);  
			});  
			
			if(buttonElement.textContent.length != 0 && buttonElement.textContent != "@TITLE@") {
				if(buttonElement.jsonparam != null)
					buttonsContainer.appendChild(document.createElement('br')); // 将 <br> 元素添加到父元素
				buttonsContainer.appendChild(buttonElement); 	
				if(buttonElement.jsonparam != null){
					var input = document.createElement('textarea');					  
					input.type = 'text';  				  
					input.id = "input" + id;					  
					input.style.minWidth='300px';		
					input.style.minHeight='160px';
					input.style.marginBottom="-20px";
					console.log(buttonElement.jsonparam);
					input.value = JSON.stringify(buttonElement.jsonparam,null,2);
				//	input.style.width = (input.value.length * 14) + 'px'; // 根据需要调整字符宽度 
					input.title = '请输入' + buttonElement.textContent + '的参数';  
					buttonsContainer.appendChild(input);		
					buttonsContainer.appendChild(document.createElement('br')); // 将 <br> 元素添加到父元素					
				}				
				if(buttonElement.editparam != null){
					var input = document.createElement('input');					  
					input.type = 'text';  				  
					input.id = "input" + id;			  
					input.style.minWidth='60px';				
					input.value = buttonElement.editparam;
					input.style.width = (input.value.length * 14) + 'px' + 20; // 根据需要调整字符宽度 
					input.title = '请输入' + buttonElement.textContent + '的参数';  
					buttonsContainer.appendChild(input);				
				}
				if(buttonElement.arrayeditparam != null){
					var input = document.createElement('input');					  
					input.type = 'text';  				  
					input.id = "input" + id;		  
					input.style.minWidth='60px';				
					input.value = buttonElement.arrayeditparam;
					input.style.width = (input.value.length * 14) + 'px' + 20; // 根据需要调整字符宽度 
					input.title = '请输入' + buttonElement.textContent + '的参数';  
					buttonsContainer.appendChild(input);				
				}
			}
			
			if (buttonElement.textContent == "@TITLE@") {
				
				var hr = document.createElement('hr'); 
				hr.style.border = 'none';  
				hr.style.height = '3px';  
				hr.style.backgroundColor = '#802b00';  
				hr.style.marginTop = '10px';  
				hr.style.marginBottom = '10px';  
				buttonsContainer.appendChild(hr);
				
				var textElement = document.createElement('p');  
					textElement.textContent = buttonElement.command; 
					textElement.style.fontSize = '20px';				
					textElement.style.fontWeight = 'bold'; 
					buttonsContainer.appendChild(textElement);
					
				var hr = document.createElement('hr'); 
				hr.style.border = 'none';  
				hr.style.height = '3px';  
				hr.style.backgroundColor = '#802b00';  
				hr.style.marginTop = '5px';  
				hr.style.marginBottom = '10px';  
				buttonsContainer.appendChild(hr);				
			}			
		});   
    };  
    reader.readAsText(file); // Start reading the file as text for parsing as JSON later on  
    };    

    // 模拟点击文件输入框，从而触发文件选择对话框
    fileInput.click();
	// 自动打开连接
	if (document.getElementsByClassName("btn-success")[0] != undefined)
		document.getElementsByClassName("btn-success")[0].click();
	
});